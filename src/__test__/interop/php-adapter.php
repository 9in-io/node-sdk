<?php
// Runs the 9in PHP SDK for the interop test. Input (stdin, JSON):
//   {"mode": "adapter", "secret": "...", "path": "...", "headers": {...}, "body": "..."}
//   {"mode": "sign", "secret": "...", "method": "POST", "path": "...", "body": "..."}
// Output (stdout, JSON).

require getenv('NINE_PHP_SDK_PATH') . '/vendor/autoload.php';

use Nine\Adapter\AdapterHandler;
use Nine\Adapter\AdapterInterface;
use Nine\Adapter\AdapterUser;
use Nine\Signature;

$input = json_decode(stream_get_contents(STDIN), true);

if ($input['mode'] === 'verify') {
    // Verify an access token with Nine\TokenVerifier against the given JWKS (no network).
    $http = new class ($input['issuer'], $input['jwks']) implements \Nine\Http\HttpClientInterface {
        private $issuer;
        private $jwks;
        public function __construct($issuer, $jwks) { $this->issuer = $issuer; $this->jwks = $jwks; }
        public function request(string $method, string $url, array $headers = [], ?string $body = null): \Nine\Http\Response
        {
            $doc = $url === $this->issuer . '/.well-known/jwks.json'
                ? $this->jwks
                : ['issuer' => $this->issuer, 'token_endpoint' => $this->issuer . '/oauth/token', 'jwks_uri' => $this->issuer . '/.well-known/jwks.json'];
            return new \Nine\Http\Response(200, [], json_encode($doc));
        }
    };
    try {
        $claims = (new \Nine\TokenVerifier($input['issuer'], $http))->verify($input['token'], ['secret' => $input['secret'] ?? null]);
        echo json_encode(['ok' => true, 'sub' => $claims['sub']]);
    } catch (\Nine\Exceptions\NineException $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

if ($input['mode'] === 'sign') {
    echo json_encode(['header' => Signature::sign($input['secret'], $input['method'], $input['path'], $input['body'])]);
    exit;
}

$adapter = new class () implements AdapterInterface {
    public function authenticate(array $identifier, string $password)
    {
        return $identifier['value'] === 'jane@acme.test' && $password === 'hunter2'
            ? new AdapterUser(['id' => '42', 'email' => 'jane@acme.test', 'name' => 'Jäne Ünicode', 'email_verified' => true])
            : self::INVALID;
    }

    public function findUser(array $query): ?AdapterUser
    {
        return null;
    }

    public function onEvent(array $event): void
    {
    }
};

$response = (new AdapterHandler($input['secret'], $adapter))->handle('POST', $input['path'], $input['headers'], $input['body']);
echo json_encode(['status' => $response->status, 'headers' => $response->headers, 'body' => $response->body]);
