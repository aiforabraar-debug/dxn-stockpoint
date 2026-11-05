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
 * Incremental pull.
 *
 * Every row carries a `rev` from a server-global counter. A client stores the
 * highest rev it has seen and asks for `?since=<rev>` next time, so a phone and
 * a browser converge on the same state after any amount of offline work.
 */
final class SyncController
{
    private const PAGE = 500;

    public static function pull(): void
    {
        $since = max(0, Util::int(Request::query('since', 0), 0));

        // Read the counter BEFORE querying. Anything written while we query has
        // a higher rev and will be delivered on the next pull instead of being
        // silently skipped.
        $serverRev = Store::currentRev();
        $isAdmin = Auth::isAdmin();

        $products = array_values(array_filter(
            Store::products(true),
            static fn (array $p): bool => $p['rev'] > $since
        ));

        $orders = [];
        $customers = [];
        $settings = null;
        $truncated = false;

        if ($isAdmin) {
            $orderRows = Database::all(
                'SELECT * FROM orders WHERE rev > ? ORDER BY rev ASC LIMIT ' . self::PAGE,
                [$since]
            );
            if (count($orderRows) === self::PAGE) {
                $truncated = true;
                $serverRev = (int) max(array_map(static fn (array $r): int => (int) $r['rev'], $orderRows));
            }

            if ($orderRows !== []) {
                $ids = array_map(static fn (array $r): int => (int) $r['id'], $orderRows);
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $itemRows = Database::all(
                    "SELECT * FROM order_items WHERE order_id IN ({$placeholders}) ORDER BY id",
                    $ids
                );
                $grouped = Store::itemsForOrders($itemRows);
                $orders = array_map(
                    static fn (array $row): array => Store::mapOrder($row, $grouped[(int) $row['id']] ?? []),
                    $orderRows
                );
            }

            $customers = Store::customers(['since_rev' => $since, 'limit' => 1000]);

            $settingsRow = Database::one('SELECT MAX(rev) AS rev FROM settings');
            if ($settingsRow !== null && (int) $settingsRow['rev'] > $since) {
                $settings = Store::settings() + Store::publicSettings();
            }
        }

        Response::ok([
            'server_rev'   => $serverRev,
            'since'        => $since,
            'scope'        => $isAdmin ? 'admin' : 'public',
            'products'     => $products,
            'orders'       => $orders,
            'customers'    => $customers,
            'settings'     => $settings,
            'truncated'    => $truncated,
            'server_time'  => gmdate('c'),
        ]);
    }

    /** Cheap endpoint clients can poll to detect "something changed". */
    public static function status(): void
    {
        Response::ok([
            'server_rev'  => Store::currentRev(),
            'server_time' => gmdate('c'),
            'scope'       => Auth::isAdmin() ? 'admin' : 'public',
        ]);
    }
}
