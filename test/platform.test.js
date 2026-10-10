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
      // Must contain informative error details rather than bare "unexpected-error"
      assert.ok(
        err.message.includes('ECONNREFUSED') ||
          err.message.includes('unexpected-error:'),
        `Expected error message to contain connection details, but got: ${err.message}`,
      );
      return true;
    },
  );
});
