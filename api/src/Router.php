<?php
declare(strict_types=1);

namespace DXN;

/**
 * Tiny path router. Patterns look like `/api/v1/products/{id}` and parameters
 * are handed to the handler as an associative array.
 */
final class Router
{
    /** @var array<int,array{method:string,regex:string,handler:callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): self
    {
        return $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): self
    {
        return $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): self
    {
        return $this->add('PUT', $pattern, $handler);
    }

    public function patch(string $pattern, callable $handler): self
    {
        return $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): self
    {
        return $this->add('DELETE', $pattern, $handler);
    }

    public function add(string $method, string $pattern, callable $handler): self
    {
        $regex = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $pattern);
        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'handler' => $handler,
        ];
        return $this;
    }

    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);
        $path = rtrim($path, '/');
        if ($path === '') {
            $path = '/';
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (preg_match($route['regex'], $path, $matches) !== 1) {
                continue;
            }

            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }

            ($route['handler'])($params);
            return;
        }

        // Friendly hint for the most common mistake: hitting the site root.
        if ($path === '/' || $path === '/index.php') {
            Response::json([
                'success' => true,
                'service' => 'Mohammadpur Stock Point API',
                'version' => Config::get('version'),
                'docs'    => '/api/v1/health',
                'installed' => Config::installed(),
            ]);
        }

        throw new ApiException("No route matches {$method} {$path}", 404, 'not_found');
    }
}
