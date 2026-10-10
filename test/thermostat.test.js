const test = require('node:test');
const assert = require('node:assert');
const hap = require('hap-nodejs');

// Mock PlatformAccessory & Logger
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
    if (!service) {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'UUID')",
      );
    }
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

test('Homebridge v2 compatibility: WiserThermostatAccessory handles hap.Service.Battery when BatteryService is undefined', () => {
  const {
    WiserThermostatAccessory,
  } = require('../dist/WiserThermostatAccessory');

  // Simulate Homebridge v2 where BatteryService was removed in favor of Battery
  const mockHapV2 = {
    Service: {
      ...hap.Service,
      Battery: hap.Service.BatteryService,
      BatteryService: undefined,
    },
    Characteristic: hap.Characteristic,
  };

  const dummyRoom = {
    id: 1,
    name: 'Test Room',
    isValid: true,
    temperature: 20,
    setTemperature: 21,
    active: false,
    mode: 2,
    thermostatIds: [10],
  };

  const dummyDevice = {
    id: 10,
    serialNumber: 'SN12345',
    firmwareVersion: '1.0',
    batteryLevel: 'Normal',
  };

  const accessory = new MockPlatformAccessory('Test Room', 'uuid-1');

  // Under the unpatched code, this will throw:
  // TypeError: Cannot read properties of undefined (reading 'UUID')
  assert.doesNotThrow(() => {
    const thermo = new WiserThermostatAccessory(
      accessory,
      mockHapV2,
      mockLogger,
      {},
      dummyRoom,
      dummyDevice,
    );
    thermo.update(dummyRoom, dummyDevice);
  });
});

test('TargetTemperature bug: update() sets TargetTemperature to room.setTemperature, NOT room.temperature', () => {
  const {
    WiserThermostatAccessory,
  } = require('../dist/WiserThermostatAccessory');

  const accessory = new MockPlatformAccessory('Living Room', 'uuid-2');
  const initialRoom = {
    id: 1,
    name: 'Living Room',
    isValid: true,
    temperature: 18.0,
    setTemperature: 19.0,
    active: false,
    mode: 2,
    thermostatIds: [],
  };

  const thermo = new WiserThermostatAccessory(
    accessory,
    hap,
    mockLogger,
    {},
    initialRoom,
  );
  const service = accessory.getService(hap.Service.Thermostat);
  const targetTempChar = service.getCharacteristic(
    hap.Characteristic.TargetTemperature,
  );

  // Update room: measured temp is 18.5, but target setpoint changed to 22.0
  const updatedRoom = {
    id: 1,
    name: 'Living Room',
    isValid: true,
    temperature: 18.5,
    setTemperature: 22.0,
    active: false,
    mode: 2,
    thermostatIds: [],
  };

  thermo.update(updatedRoom);

  // Under the unpatched code, TargetTemperature was set to room.temperature (18.5) instead of room.setTemperature (22.0)
  assert.strictEqual(
    targetTempChar.value,
    22.0,
    `Expected TargetTemperature to be 22.0, but got ${targetTempChar.value}`,
  );
});
