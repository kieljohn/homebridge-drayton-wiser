const test = require('node:test');
const assert = require('node:assert');
const hap = require('hap-nodejs');

class MockPlatformAccessory {
  constructor(displayName, uuid) {
    this.displayName = displayName;
    this.UUID = uuid;
    this.services = new Map();
  }

  getService(serviceType) {
    if (!serviceType) return undefined;
    const uuid =
      typeof serviceType === 'string' ? serviceType : serviceType.UUID;
    return this.services.get(uuid);
  }

  addService(service) {
    const instance = typeof service === 'function' ? new service() : service;
    this.services.set(instance.UUID, instance);
    return instance;
  }
}

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

test('WiserSmartPlugAccessory: registers Outlet service with On, OutletInUse, and Eve Energy characteristics', async () => {
  const {
    WiserSmartPlugAccessory,
  } = require('../dist/WiserSmartPlugAccessory');

  const initialPlug = {
    id: 14,
    Name: 'Pyro Server',
    OutputState: 'Off',
    TargetState: 'Off',
    InstantaneousDemand: 0,
    CurrentSummationDelivered: 75351,
  };

  const dummyDevice = {
    id: 14,
    serialNumber: '000D6F0018D320A9',
    firmwareVersion: '0.0.34',
  };

  let dispatchedId = null;
  let dispatchedState = null;
  const mockClient = {
    setSmartPlugState: async (id, state) => {
      dispatchedId = id;
      dispatchedState = state;
      return { status: 200 };
    },
  };

  const accessory = new MockPlatformAccessory('Pyro Server', 'uuid-plug-14');
  const plugAcc = new WiserSmartPlugAccessory(
    accessory,
    hap,
    mockLogger,
    mockClient,
    initialPlug,
    dummyDevice,
  );

  const service = accessory.getService(hap.Service.Outlet);
  assert.ok(service, 'Outlet service must be registered');

  // Test On getter
  const onChar = service.getCharacteristic(hap.Characteristic.On);
  let onVal;
  onChar.emit('get', (_, val) => (onVal = val));
  assert.strictEqual(onVal, false, 'Initial state should be Off (false)');

  // Test On setter
  await onChar.emit('set', true, () => {});
  assert.strictEqual(dispatchedId, 14);
  assert.strictEqual(dispatchedState, true);

  // Test OutletInUse getter when demand is 0 and Off
  const inUseChar = service.getCharacteristic(hap.Characteristic.OutletInUse);
  let inUseVal;
  inUseChar.emit('get', (_, val) => (inUseVal = val));
  assert.strictEqual(
    inUseVal,
    false,
    'OutletInUse should be false when 0W and Off',
  );

  // Test Eve Energy Current Consumption characteristic (Watts)
  const currentConsumptionChar = service.getCharacteristic(
    'Current Consumption',
  );
  assert.ok(
    currentConsumptionChar,
    'Current Consumption characteristic must exist',
  );
  let currentWatts;
  currentConsumptionChar.emit('get', (_, val) => (currentWatts = val));
  assert.strictEqual(currentWatts, 0);

  // Test Eve Energy Total Consumption characteristic (kWh)
  const totalConsumptionChar = service.getCharacteristic('Total Consumption');
  assert.ok(
    totalConsumptionChar,
    'Total Consumption characteristic must exist',
  );
  let totalKwh;
  totalConsumptionChar.emit('get', (_, val) => (totalKwh = val));
  assert.strictEqual(totalKwh, 75.351, '75351 Wh should equal 75.351 kWh');

  // Test update with live power draw
  const updatedPlug = {
    id: 14,
    Name: 'Pyro Server',
    OutputState: 'On',
    TargetState: 'On',
    InstantaneousDemand: 120, // 120W
    CurrentSummationDelivered: 75400,
  };

  plugAcc.update(updatedPlug);

  assert.strictEqual(onChar.value, true);
  assert.strictEqual(
    inUseChar.value,
    true,
    'OutletInUse must be true when drawing 120W',
  );
  assert.strictEqual(
    currentConsumptionChar.value,
    120,
    'Current Consumption should update to 120W',
  );
  assert.strictEqual(
    totalConsumptionChar.value,
    75.4,
    'Total Consumption should update to 75.4 kWh',
  );
});
