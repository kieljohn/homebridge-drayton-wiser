const test = require('node:test');
const assert = require('node:assert');

test('findRoomDevices: includes RoomStat device and does not mutate incoming devices array', () => {
  const { WiserPlatformPlugin } = require('../dist/WiserPlatformPlugin');

  const room = {
    id: 1,
    thermostatIds: [2],
    roomStatId: 5,
  };

  const devices = [
    { id: 2, serialNumber: 'TRV1' },
    { id: 5, serialNumber: 'STAT1' },
    { id: 7, serialNumber: 'OTHER' },
  ];

  const matched = WiserPlatformPlugin.prototype.findRoomDevices(room, devices);

  assert.strictEqual(
    matched.length,
    2,
    'Should match both TRV (2) and RoomStat (5)',
  );
  assert.ok(
    matched.find((d) => d.id === 2),
    'Should contain TRV id 2',
  );
  assert.ok(
    matched.find((d) => d.id === 5),
    'Should contain RoomStat id 5',
  );
  assert.strictEqual(
    devices.length,
    3,
    'Incoming devices array must NOT be mutated',
  );
});

test('findRoomDevices: room with only roomStatId (no TRVs) returns roomStat device in matched', () => {
  const { WiserPlatformPlugin } = require('../dist/WiserPlatformPlugin');

  const room = {
    id: 3,
    thermostatIds: [],
    roomStatId: 5,
  };

  const devices = [
    { id: 2, serialNumber: 'TRV1' },
    { id: 5, serialNumber: 'STAT1' },
  ];

  const matched = WiserPlatformPlugin.prototype.findRoomDevices(room, devices);

  assert.strictEqual(matched.length, 1, 'Should match RoomStat (5)');
  assert.strictEqual(matched[0].id, 5);
  assert.strictEqual(
    devices.length,
    2,
    'Incoming devices array must NOT be mutated',
  );
});

test('SetpointOrigin.FromManualMode: maps to RoomMode.Manual', () => {
  require('../dist/WiserPlatformPlugin');
  const { FullStatus, RoomMode } = require('@string-bean/drayton-wiser-client');

  const fullStatus = new FullStatus({
    System: {},
    Device: [],
    Room: [
      {
        id: 11,
        Name: 'Spare Room',
        SetpointOrigin: 'FromManualMode',
        CurrentSetPoint: 200,
        CalculatedTemperature: 210,
      },
    ],
    Zigbee: {},
  });

  assert.strictEqual(
    fullStatus.rooms[0].mode,
    RoomMode.Manual,
    `Expected RoomMode.Manual (4), but got ${fullStatus.rooms[0].mode}`,
  );
});

test('WiserClient resilience: preserves underlying error details when requests fail', async () => {
  require('../dist/WiserPlatformPlugin');
  const { WiserClient } = require('@string-bean/drayton-wiser-client');

  // Point to a non-existent port on localhost to trigger connection failure
  const client = WiserClient.clientWithAddress(
    'dummy-secret',
    '127.0.0.1:54329',
  );

  await assert.rejects(
    async () => {
      await client.fullStatus();
    },
    (err) => {
      assert.ok(
        err.message.includes('ECONNREFUSED') ||
          err.message.includes('unexpected-error:'),
        `Expected error message to contain connection details, but got: ${err.message}`,
      );
      return true;
    },
  );
});

test('FullStatus: extracts and exposes smartPlugs from raw json', () => {
  require('../dist/WiserPlatformPlugin');
  const { FullStatus } = require('@string-bean/drayton-wiser-client');

  const rawPlug = {
    id: 14,
    Name: 'Pyro Server',
    OutputState: 'Off',
    TargetState: 'Off',
    InstantaneousDemand: 45,
    CurrentSummationDelivered: 12000,
  };

  const status = new FullStatus({
    System: {},
    Device: [],
    Room: [],
    Zigbee: {},
    SmartPlug: [rawPlug],
  });

  assert.ok(Array.isArray(status.smartPlugs), 'smartPlugs should be an array');
  assert.strictEqual(status.smartPlugs.length, 1);
  assert.strictEqual(status.smartPlugs[0].id, 14);
  assert.strictEqual(status.smartPlugs[0].InstantaneousDemand, 45);
});

test('WiserClient: setSmartPlugState sends correct PATCH payload', async () => {
  require('../dist/WiserPlatformPlugin');
  const { WiserClient } = require('@string-bean/drayton-wiser-client');

  const client = WiserClient.clientWithAddress('dummy-secret', '127.0.0.1:80');

  let calledEndpoint, calledMethod, calledBody;
  client.request = async (endpoint, method, body) => {
    calledEndpoint = endpoint;
    calledMethod = method;
    calledBody = body;
    return { status: 200 };
  };

  await client.setSmartPlugState(14, true);
  assert.strictEqual(calledEndpoint, 'domain/SmartPlug/14');
  assert.strictEqual(calledMethod, 'PATCH');
  assert.deepStrictEqual(calledBody, { RequestOutput: 'On' });

  await client.setSmartPlugState(14, false);
  assert.deepStrictEqual(calledBody, { RequestOutput: 'Off' });
});
