<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

/**
 * Staff-facing PV distribution endpoints.
 *
 * Only shop admins can credit PV to a member. Every distribution is an
 * append-only audit row; the unique key on (reference_type, reference_id)
 * makes retries idempotent.
 */
final class PVDistributionController
{
    public static function distribute(): void
    {
        Auth::requireAdmin();

        $payload = Request::json();
        $memberId = Util::clean($payload['member_id'] ?? '', 40);
        $pvAmount = Util::money($payload['pv_amount'] ?? 0);
        $reason   = Util::clean($payload['reason'] ?? 'Manual PV credit', 160);
        $refType  = Util::clean($payload['reference_type'] ?? 'manual', 32);
        $refId    = Util::clean($payload['reference_id'] ?? '', 64);

        if ($memberId === '') {
            Response::error('member_id is required', 422, 'validation_error');
        }
        if ($pvAmount <= 0) {
            Response::error('pv_amount must be greater than 0', 422, 'validation_error');
        }

        $customer = Database::one(
            'SELECT * FROM customers WHERE dxn_member_id = ? AND is_member = 1 LIMIT 1',
            [$memberId]
        );
        if ($customer === null) {
            Response::error('Member not found', 404, 'not_found');
        }

        // Idempotency: same reference already processed -> return existing row
        if ($refId !== '') {
            $existing = Database::one(
                'SELECT * FROM pv_distributions WHERE reference_type = ? AND reference_id = ? LIMIT 1',
                [$refType, $refId]
            );
            if ($existing !== null) {
                $customer = Database::one('SELECT * FROM customers WHERE id = ?', [(int) $existing['member_id'] === 0 ? (int) $customer['id'] : (int) $existing['member_id']]);
                Response::ok([
                    'distribution' => Store::mapPvDistribution($existing),
                    'new_balance'  => (float) ($customer['total_pv'] ?? 0),
                    'duplicate'    => true,
                ]);
            }
        }

        [$distribution, $newBalance] = Database::transaction(static function () use (
            $customer, $pvAmount, $reason, $refType, $refId
        ): array {
            $staffId = null;
            $claims = \DXN\Auth::claims();
            if ($claims !== null && isset($claims['admin_id'])) {
                $staffId = (int) $claims['admin_id'];
            }

            $rev = Store::nextRev();
            $now = Util::now();

            Database::run(
                'INSERT INTO pv_distributions
                    (member_id, staff_id, pv_amount, reason, reference_type, reference_id, created_at, updated_at, rev)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $customer['dxn_member_id'],
                    $staffId,
                    $pvAmount,
                    $reason,
                    $refType,
                    $refId !== '' ? $refId : null,
                    $now,
                    $now,
                    $rev,
                ]
            );
            $distributionId = Database::lastId();

            // Credit the member's running PV balance
            Database::run(
                'UPDATE customers SET total_pv = total_pv + ?, updated_at = ?, rev = ? WHERE id = ?',
                [$pvAmount, $now, $rev, (int) $customer['id']]
            );

            Store::audit('pv_distributed', 'customer', (string) $customer['id'],
                sprintf('%s +%.2f PV', $customer['dxn_member_id'], $pvAmount));

            $row = Database::one('SELECT * FROM pv_distributions WHERE id = ?', [$distributionId]);
            $updated = Database::one('SELECT * FROM customers WHERE id = ?', [(int) $customer['id']]);

            return [Store::mapPvDistribution($row), (float) ($updated['total_pv'] ?? 0)];
        });

        Response::ok([
            'distribution' => $distribution,
            'new_balance'  => $newBalance,
            'duplicate'    => false,
        ], 201);
    }

    public static function members(): void
    {
        Auth::requireAdmin();

        $q     = Util::clean(Request::query('q', ''), 80);
        $limit = max(1, min(Util::int(Request::query('limit', 100), 1), 500));

        $where = 'is_member = 1';
        $params = [];
        if ($q !== '') {
            $where .= ' AND (dxn_member_id LIKE ? OR name LIKE ? OR phone LIKE ?)';
            $like = '%' . $q . '%';
            $params = [$like, $like, $like];
        }

        $rows = Database::all(
            "SELECT id, dxn_member_id AS member_id, name, phone, total_pv, total_orders, total_spent, updated_at
             FROM customers
             WHERE {$where}
             ORDER BY total_pv DESC, updated_at DESC
             LIMIT {$limit}",
            $params
        );

        Response::ok([
            'members' => array_map(static fn (array $r): array => [
                'id'          => (int) $r['id'],
                'member_id'   => (string) $r['member_id'],
                'name'        => (string) $r['name'],
                'phone'       => $r['phone'] ?? null,
                'total_pv'    => (float) $r['total_pv'],
                'total_orders'=> (int) $r['total_orders'],
                'total_spent' => (float) $r['total_spent'],
                'updated_at'  => (string) $r['updated_at'],
            ], $rows),
            'count' => count($rows),
        ]);
    }

    public static function distributions(): void
    {
        Auth::requireAdmin();

        $q      = Util::clean(Request::query('q', ''), 80);
        $limit  = max(1, min(Util::int(Request::query('limit', 100), 1), 500));
        $offset = max(0, Util::int(Request::query('offset', 0), 0));

        $where = '1';
        $params = [];
        if ($q !== '') {
            $where .= ' AND (member_id LIKE ? OR reason LIKE ? OR reference_id LIKE ?)';
            $like = '%' . $q . '%';
            $params = [$like, $like, $like];
        }

        $rows = Database::all(
            "SELECT id, member_id, staff_id, pv_amount, reason, reference_type, reference_id,
                      created_at, rev
             FROM pv_distributions
             WHERE {$where}
             ORDER BY created_at DESC, id DESC
             LIMIT {$offset}, {$limit}",
            $params
        );

        $total = (int) Database::scalar(
            "SELECT COUNT(*) FROM pv_distributions WHERE {$where}",
            $params
        );

        Response::ok([
            'distributions' => array_map([self::class, 'mapDistRow'], $rows),
            'count'   => count($rows),
            'total'   => $total,
            'offset'  => $offset,
            'limit'   => $limit,
        ]);
    }

    private static function mapDistRow(array $r): array
    {
        return [
            'id'             => (int) $r['id'],
            'member_id'      => (string) $r['member_id'],
            'staff_id'       => $r['staff_id'] === null ? null : (int) $r['staff_id'],
            'pv_amount'      => (float) $r['pv_amount'],
            'reason'         => (string) $r['reason'],
            'reference_type' => $r['reference_type'] ?? null,
            'reference_id'   => $r['reference_id'] ?? null,
            'created_at'     => (string) $r['created_at'],
        ];
    }
}
