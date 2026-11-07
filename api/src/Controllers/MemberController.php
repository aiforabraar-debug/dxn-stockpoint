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
 * Member-facing profile and PV history endpoints.
 * Requires a valid bearer token with role=member.
 */
final class MemberController
{
    public static function me(): void
    {
        Auth::requireMember();

        $customerId = Auth::memberCustomerId();
        if ($customerId === null) {
            Response::error('Member context missing', 401, 'unauthorized');
        }

        $row = Database::one('SELECT * FROM customers WHERE id = ? AND is_member = 1 LIMIT 1', [$customerId]);
        if ($row === null) {
            Response::error('Member not found', 404, 'not_found');
        }

        Response::ok(['member' => Store::mapMember($row)]);
    }

    public static function pvHistory(): void
    {
        Auth::requireMember();

        $memberId = Auth::memberId();
        if ($memberId === null || $memberId === '') {
            Response::error('Member context missing', 401, 'unauthorized');
        }

        $limit  = max(1, min(Util::int(Request::query('limit', 50), 1), 200));
        $offset = max(0, Util::int(Request::query('offset', 0), 0));

        $rows = Database::all(
            'SELECT id, member_id, staff_id, pv_amount, reason, reference_type, reference_id, created_at, rev
             FROM pv_distributions
             WHERE member_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?, ?',
            [$memberId, $offset, $limit]
        );

        $total = (int) Database::scalar(
            'SELECT COUNT(*) FROM pv_distributions WHERE member_id = ?',
            [$memberId]
        );

        Response::ok([
            'member_id'   => $memberId,
            'distributions' => array_map([self::class, 'mapRow'], $rows),
            'count'   => count($rows),
            'total'   => $total,
            'offset'  => $offset,
            'limit'   => $limit,
        ]);
    }

    private static function mapRow(array $r): array
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
