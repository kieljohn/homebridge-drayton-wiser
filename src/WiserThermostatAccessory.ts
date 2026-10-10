import { BaseAccessory, ServiceType } from './BaseAccessory';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import {
  Device,
  Room,
  RoomMode,
  WiserClient,
} from '@string-bean/drayton-wiser-client';
import { HAP } from 'homebridge/lib/api';
import { BatteryLevel } from '@string-bean/drayton-wiser-client/dist/api/BatteryLevel';

type ServiceWithBattery = {
  Battery?: ServiceType;
  BatteryService?: ServiceType;
};

export class WiserThermostatAccessory extends BaseAccessory {
  private get batteryServiceType(): ServiceType {
    const services = (this.hap.Service as unknown) as ServiceWithBattery;
    return (services.Battery ?? services.BatteryService) as ServiceType;
  }

  constructor(
    accessory: PlatformAccessory,
    hap: HAP,
    log: Logger,
    client: WiserClient,
    private room: Room,
    private device?: Device,
  ) {
    super(accessory, hap, log, client);
    const Characteristic = hap.Characteristic;

    this.registerCharacteristic({
      serviceType: hap.Service.Thermostat,
      characteristicType: Characteristic.CurrentHeatingCoolingState,
      getter: () =>
        WiserThermostatAccessory.roomCurrentState(this.room, this.hap),
      props: {
        validValues: [
          Characteristic.CurrentHeatingCoolingState.HEAT,
          Characteristic.CurrentHeatingCoolingState.OFF,
        ],
      },
    });

    this.registerCharacteristic({
      serviceType: hap.Service.Thermostat,
      characteristicType: Characteristic.TargetHeatingCoolingState,
      getter: () =>
        WiserThermostatAccessory.roomTargetState(this.room, this.hap),
      setter: this.setTargetState.bind(this),
      props: {
        validValues: [
          Characteristic.TargetHeatingCoolingState.OFF,
          Characteristic.TargetHeatingCoolingState.HEAT,
          Characteristic.TargetHeatingCoolingState.AUTO,
        ],
      },
    });

    this.registerCharacteristic({
      serviceType: hap.Service.Thermostat,
      characteristicType: Characteristic.CurrentTemperature,
      getter: () => {
        return this.room.temperature;
      },
    });

    this.registerCharacteristic({
      serviceType: hap.Service.Thermostat,
      characteristicType: Characteristic.TargetTemperature,
      getter: () => {
        return this.room.setTemperature;
      },
      setter: this.setTargetTemperature.bind(this),
      props: {
        minValue: 5,
        minStep: 0.5,
        maxValue: 30,
      },
    });

    this.registerCharacteristic({
      serviceType: hap.Service.Thermostat,
      characteristicType: Characteristic.TemperatureDisplayUnits,
      getter: () => Characteristic.TemperatureDisplayUnits.CELSIUS,
      setter: () => Promise.resolve(),
    });

    if (device) {
      const services = (hap.Service as unknown) as ServiceWithBattery;
      const batteryService = (services.Battery ??
        services.BatteryService) as ServiceType;

      this.registerCharacteristic({
        serviceType: batteryService,
        characteristicType: Characteristic.BatteryLevel,
        getter: () => {
          if (this.device) {
            return WiserThermostatAccessory.batteryLevel(this.device);
          } else {
            return 0;
          }
        },
      });

      this.registerCharacteristic({
        serviceType: batteryService,
        characteristicType: Characteristic.StatusLowBattery,
        getter: () => this.device?.batteryLevel === BatteryLevel.Low,
      });
    }
  }

  update(room: Room, device?: Device): void {
    if (this.room.temperature !== room.temperature) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Thermostat,
        characteristicType: this.hap.Characteristic.CurrentTemperature,
        value: room.temperature ? room.temperature : 0,
      });
    }

    if (this.room.setTemperature !== room.setTemperature) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Thermostat,
        characteristicType: this.hap.Characteristic.TargetTemperature,
        value: room.setTemperature ? room.setTemperature : 0,
      });
    }

    if (this.room.active !== room.active) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Thermostat,
        characteristicType: this.hap.Characteristic.CurrentHeatingCoolingState,
        value: WiserThermostatAccessory.roomCurrentState(room, this.hap),
      });
    }

    if (this.room.mode !== room.mode) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Thermostat,
        characteristicType: this.hap.Characteristic.TargetHeatingCoolingState,
        value: WiserThermostatAccessory.roomTargetState(room, this.hap),
      });
    }

    this.room = room;

    if (device) {
      if (this.device?.batteryLevel !== device.batteryLevel) {
        this.updateCharacteristic({
          serviceType: this.batteryServiceType,
          characteristicType: this.hap.Characteristic.BatteryLevel,
          value: WiserThermostatAccessory.batteryLevel(device) ?? 0,
        });

        this.updateCharacteristic({
          serviceType: this.batteryServiceType,
          characteristicType: this.hap.Characteristic.StatusLowBattery,
          value: device.batteryLevel === BatteryLevel.Low,
        });
      }

      this.device = device;
    }
  }

  private setTargetState(value: CharacteristicValue): Promise<void> {
    let postUpdate: Promise<Room>;

    switch (value) {
      case this.hap.Characteristic.TargetHeatingCoolingState.OFF:
        postUpdate = this.client.disableRoom(this.room.id);
        break;

      case this.hap.Characteristic.TargetHeatingCoolingState.HEAT:
        postUpdate = this.client.overrideRoomSetPoint(
          this.room.id,
          this.room.setTemperature ?? 20,
        );
        break;

      case this.hap.Characteristic.TargetHeatingCoolingState.AUTO:
      default:
        postUpdate = this.client.cancelRoomOverride(this.room.id);
    }

    return postUpdate.then((updated) => {
      this.update(updated);
    });
  }

  private setTargetTemperature(value: CharacteristicValue): Promise<void> {
    if (this.room.isValid) {
      return this.client
        .overrideRoomSetPoint(this.room.id, <number>value)
        .then((updated) => {
          this.update(updated);
        });
    } else {
      return Promise.resolve();
    }
  }

  private static roomTargetState(room: Room, hap: HAP): CharacteristicValue {
    switch (room.mode) {
      case RoomMode.Off:
        return hap.Characteristic.TargetHeatingCoolingState.OFF;

      case RoomMode.Manual:
      case RoomMode.Boost:
        return hap.Characteristic.TargetHeatingCoolingState.HEAT;

      default:
        return hap.Characteristic.TargetHeatingCoolingState.AUTO;
    }
  }

  private static roomCurrentState(room: Room, hap: HAP): CharacteristicValue {
    if (room.active) {
      return hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else {
      return hap.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }

  private static batteryLevel(
    device?: Device,
  ): CharacteristicValue | undefined {
    switch (device?.batteryLevel) {
      case BatteryLevel.Normal:
        return 100;

      case BatteryLevel.TwoThirds:
        return 66;

      case BatteryLevel.OneThird:
        return 33;

      case BatteryLevel.Low:
        return 10;

      default:
        return undefined;
    }
  }
}
