<?php

declare(strict_types=1);

use Composer\CaBundle\CaBundle;
use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/vendor/autoload.php';

loadEnv(__DIR__ . '/.env');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($path, '/');

try {
    if ($method === 'GET' && $path === '/') {
        jsonResponse(200, ['message' => 'DPS Map Download API is running']);
    }

    if ($method === 'POST' && $path === '/api/request-map') {
        requestMap();
    }

    if ($method === 'POST' && $path === '/api/verify-otp') {
        verifyOtp();
    }

    if ($method === 'GET' && preg_match('#^/api/download/([^/]+)$#', $path, $matches) === 1) {
        downloadMap(rawurldecode($matches[1]));
    }

    jsonResponse(404, ['message' => 'Route not found']);
} catch (Throwable $error) {
    error_log($error->__toString());
    jsonResponse(500, ['message' => 'Internal server error']);
}

function requestMap(): never
{
    $body = jsonBody();
    $name = $body['name'] ?? null;
    $email = $body['email'] ?? null;
    $mapName = $body['mapName'] ?? null;

    if (!$name || !$email || !$mapName) {
        jsonResponse(400, ['message' => 'All fields are required']);
    }

    $otp = (string) random_int(100000, 999999);
    $expiresAt = (new DateTimeImmutable('+5 minutes'))->format(DateTimeInterface::ATOM);

    $result = supabaseRequest('POST', '/rest/v1/map_requests', [[
        'name' => $name,
        'email' => $email,
        'map_name' => $mapName,
        'otp' => $otp,
        'otp_expires_at' => $expiresAt,
        'verified' => false,
    ]], ['Prefer: return=representation']);

    if (!$result['ok'] || !isset($result['data'][0]['id'])) {
        error_log('Supabase error: ' . $result['raw']);
        jsonResponse(500, ['message' => 'Failed to save map request']);
    }

    try {
        sendOtpEmail((string) $email, $otp);
    } catch (Throwable $error) {
        error_log('Email error: ' . $error->getMessage());
        jsonResponse(500, ['message' => 'Request saved, but OTP email failed']);
    }

    jsonResponse(201, [
        'message' => 'OTP sent to your email',
        'requestId' => $result['data'][0]['id'],
    ]);
}

function verifyOtp(): never
{
    $body = jsonBody();
    $requestId = $body['requestId'] ?? null;
    $otp = $body['otp'] ?? null;

    if (!$requestId || !$otp) {
        jsonResponse(400, ['message' => 'Request ID and OTP are required']);
    }

    $result = findRequest((string) $requestId);
    if (!$result['ok'] || !isset($result['data'][0])) {
        jsonResponse(404, ['message' => 'Request not found']);
    }

    $request = $result['data'][0];

    if (!empty($request['verified'])) {
        jsonResponse(400, ['message' => 'This request is already verified']);
    }

    try {
        $expiresAt = new DateTimeImmutable((string) $request['otp_expires_at']);
    } catch (Throwable) {
        jsonResponse(400, ['message' => 'OTP has expired']);
    }

    if (new DateTimeImmutable() > $expiresAt) {
        jsonResponse(400, ['message' => 'OTP has expired']);
    }

    if ((string) $request['otp'] !== (string) $otp) {
        jsonResponse(400, ['message' => 'Invalid OTP']);
    }

    $update = supabaseRequest(
        'PATCH',
        '/rest/v1/map_requests?id=eq.' . rawurlencode((string) $requestId),
        ['verified' => true]
    );

    if (!$update['ok']) {
        error_log('Update error: ' . $update['raw']);
        jsonResponse(500, ['message' => 'Failed to verify request']);
    }

    jsonResponse(200, ['message' => 'OTP verified successfully']);
}

function downloadMap(string $requestId): never
{
    $result = findRequest($requestId);
    if (!$result['ok'] || !isset($result['data'][0])) {
        jsonResponse(404, ['message' => 'Request not found']);
    }

    $request = $result['data'][0];
    if (empty($request['verified'])) {
        jsonResponse(403, ['message' => 'OTP verification required']);
    }

    $files = [
        'Yangon Map' => 'yangon-map.pdf',
        'Myanmar Map' => 'myanmar-map.pdf',
        'Mandalay Map' => 'mandalay-map.pdf',
    ];
    $fileName = $files[$request['map_name'] ?? ''] ?? null;

    if ($fileName === null) {
        jsonResponse(404, ['message' => 'Map file not found']);
    }

    $mapsDirectory = envValue('MAPS_DIR', __DIR__ . '/../server/maps');
    $filePath = realpath($mapsDirectory . DIRECTORY_SEPARATOR . $fileName);

    if ($filePath === false || !is_file($filePath)) {
        jsonResponse(404, ['message' => 'Map file not found']);
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $fileName . '"');
    header('Content-Length: ' . filesize($filePath));
    header('X-Content-Type-Options: nosniff');
    readfile($filePath);
    exit;
}

function findRequest(string $requestId): array
{
    return supabaseRequest(
        'GET',
        '/rest/v1/map_requests?id=eq.' . rawurlencode($requestId) . '&select=*'
    );
}

function supabaseRequest(string $method, string $endpoint, ?array $body = null, array $headers = []): array
{
    $url = rtrim(requiredEnv('SUPABASE_URL'), '/') . $endpoint;
    $key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    $curl = curl_init($url);

    $requestHeaders = array_merge([
        'apikey: ' . $key,
        'Authorization: Bearer ' . $key,
        'Accept: application/json',
    ], $headers);

    if ($body !== null) {
        $encodedBody = json_encode($body, JSON_THROW_ON_ERROR);
        $requestHeaders[] = 'Content-Type: application/json';
        curl_setopt($curl, CURLOPT_POSTFIELDS, $encodedBody);
    }

    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CAINFO => CaBundle::getSystemCaRootBundlePath(),
    ]);

    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($raw === false) {
        return ['ok' => false, 'status' => 0, 'data' => null, 'raw' => $curlError];
    }

    $data = $raw === '' ? [] : json_decode($raw, true);
    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'data' => $data,
        'raw' => $raw,
    ];
}

function sendOtpEmail(string $email, string $otp): void
{
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = requiredEnv('EMAIL_USER');
    // Google commonly displays 16-character app passwords in four groups.
    $mail->Password = str_replace(' ', '', requiredEnv('EMAIL_PASS'));
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = 587;
    $mail->SMTPOptions = [
        'ssl' => [
            'cafile' => CaBundle::getSystemCaRootBundlePath(),
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
        ],
    ];

    $mail->setFrom($mail->Username, 'DPS Map Download');
    $mail->addAddress($email);
    $mail->Subject = 'Your Map Download OTP';
    $mail->Body = "Your OTP is {$otp}. It will expire in 5 minutes.";
    $mail->send();
}

function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        return is_array($data) ? $data : [];
    } catch (JsonException) {
        return [];
    }
}

function jsonResponse(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function loadEnv(string $file): void
{
    if (!is_file($file)) {
        return;
    }

    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = array_map('trim', explode('=', $line, 2));
        $value = trim($value, "\"'");
        if ($name !== '' && getenv($name) === false) {
            putenv("{$name}={$value}");
            $_ENV[$name] = $value;
        }
    }
}

function envValue(string $name, ?string $default = null): ?string
{
    $value = getenv($name);
    return $value === false || $value === '' ? $default : $value;
}

function requiredEnv(string $name): string
{
    $value = envValue($name);
    if ($value === null) {
        throw new RuntimeException("Missing required environment variable: {$name}");
    }
    return $value;
}
