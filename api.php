<?php
// Antrenor TV: salvează istoricul antrenamentelor (PHP 7.4+).
// GET  api.php?action=all&secret=...      -> {ok, workouts, sets, state}
// POST api.php  body: {"secret": "...", "ops": [{"kind": "set|workout|state", "data": {...}}]}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond($code, $payload)
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    respond(500, ['ok' => false, 'error' => 'missing_config']);
}
$config = require $configFile;
$secret = isset($config['secret']) ? (string) $config['secret'] : '';

$dataDir = __DIR__ . '/data';
$historyFile = $dataDir . '/history.json';

function authorized($given, $secret)
{
    return $secret !== '' && is_string($given) && hash_equals($secret, $given);
}

function emptyHistory()
{
    return ['workouts' => [], 'sets' => [], 'state' => null];
}

// A file that exists but cannot be read or decoded is an error, never "empty":
// treating it as empty would let the next write wipe the history.
function readHistory($file)
{
    if (!is_file($file)) {
        return emptyHistory();
    }
    $raw = file_get_contents($file);
    $data = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($data)) {
        respond(500, ['ok' => false, 'error' => 'corrupt_history']);
    }
    return array_merge(emptyHistory(), $data);
}

function validOp($op)
{
    if (!is_array($op) || !isset($op['kind'], $op['data']) || !is_array($op['data'])) {
        return false;
    }
    if (!in_array($op['kind'], ['set', 'workout', 'state'], true)) {
        return false;
    }
    if ($op['kind'] === 'state') {
        return true;
    }
    $id = isset($op['data']['id']) ? $op['data']['id'] : null;
    return is_string($id) && $id !== '' && strlen($id) <= 64;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($method === 'GET') {
    if (!authorized(isset($_GET['secret']) ? $_GET['secret'] : null, $secret)) {
        respond(403, ['ok' => false, 'error' => 'unauthorized']);
    }
    $h = readHistory($historyFile);
    respond(200, ['ok' => true, 'workouts' => $h['workouts'], 'sets' => $h['sets'], 'state' => $h['state']]);
}

if ($method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$raw = file_get_contents('php://input', false, null, 0, 262145);
if ($raw === false || strlen($raw) > 262144) {
    respond(400, ['ok' => false, 'error' => 'bad_request']);
}
$body = json_decode($raw, true);
if (!is_array($body) || !isset($body['ops']) || !is_array($body['ops'])) {
    respond(400, ['ok' => false, 'error' => 'bad_request']);
}
if (!authorized(isset($body['secret']) ? $body['secret'] : null, $secret)) {
    respond(403, ['ok' => false, 'error' => 'unauthorized']);
}
foreach ($body['ops'] as $op) {
    if (!validOp($op)) {
        respond(400, ['ok' => false, 'error' => 'bad_request']);
    }
}

if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
    respond(500, ['ok' => false, 'error' => 'storage']);
}
$lock = fopen($dataDir . '/.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    respond(500, ['ok' => false, 'error' => 'storage']);
}

$h = readHistory($historyFile);
$setIds = [];
foreach ($h['sets'] as $s) {
    $setIds[$s['id']] = true;
}
$applied = 0;

foreach ($body['ops'] as $op) {
    $data = $op['data'];
    if ($op['kind'] === 'set') {
        if (!isset($setIds[$data['id']])) {
            $h['sets'][] = $data;
            $setIds[$data['id']] = true;
            $applied++;
        }
    } elseif ($op['kind'] === 'workout') {
        $found = false;
        foreach ($h['workouts'] as $i => $w) {
            if ($w['id'] === $data['id']) {
                $found = true;
                if ($w != $data) {
                    $h['workouts'][$i] = $data;
                    $applied++;
                }
                break;
            }
        }
        if (!$found) {
            $h['workouts'][] = $data;
            $applied++;
        }
    } else {
        if ($h['state'] != $data) {
            $h['state'] = $data;
            $applied++;
        }
    }
}

if ($applied > 0) {
    $tmp = $historyFile . '.tmp';
    $json = json_encode($h, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $written = $json === false ? false : file_put_contents($tmp, $json);
    if ($written !== strlen($json)) {
        @unlink($tmp);
        flock($lock, LOCK_UN);
        respond(500, ['ok' => false, 'error' => 'storage']);
    }
    if (is_file($historyFile)) {
        @copy($historyFile, $historyFile . '.bak');
    }
    if (!rename($tmp, $historyFile)) {
        flock($lock, LOCK_UN);
        respond(500, ['ok' => false, 'error' => 'storage']);
    }
}

flock($lock, LOCK_UN);
fclose($lock);
respond(200, ['ok' => true, 'applied' => $applied]);
