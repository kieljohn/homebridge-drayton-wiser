import { BaseAccessory, CharacteristicType } from './BaseAccessory';
import {
  CharacteristicValue,
  Logger,
  PlatformAccessory,
} from 'homebridge';
import { Device, WiserClient } from '@string-bean/drayton-wiser-client';
import { HAP } from 'homebridge/lib/api';

export interface SmartPlugData {
  id: number;
  Name: string;
  OutputState: string;
  TargetState?: string;
  InstantaneousDemand: number;
  CurrentSummationDelivered: number;
  RoomId?: number;
}

export function createCurrentConsumptionCharacteristic(
  hap: HAP,
): CharacteristicType {
  const CurrentConsumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

  class CurrentConsumption extends hap.Characteristic {
    public static readonly UUID = CurrentConsumptionUUID;

    constructor() {
      super('Current Consumption', CurrentConsumptionUUID, {
        format: hap.Characteristic.Formats.FLOAT,
        unit: ('W' as unknown) as undefined,
        minValue: 0,
        maxValue: 65535,
        minStep: 0.1,
        perms: [
          hap.Characteristic.Perms.PAIRED_READ,
          hap.Characteristic.Perms.NOTIFY,
        ],
      });
      this.value = this.getDefaultValue();
    }
  }

  return (CurrentConsumption as unknown) as CharacteristicType;
}

export function createTotalConsumptionCharacteristic(
  hap: HAP,
): CharacteristicType {
  const TotalConsumptionUUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

  class TotalConsumption extends hap.Characteristic {
    public static readonly UUID = TotalConsumptionUUID;

    constructor() {
      super('Total Consumption', TotalConsumptionUUID, {
        format: hap.Characteristic.Formats.FLOAT,
        unit: ('kWh' as unknown) as undefined,
        minValue: 0,
        maxValue: 65535,
        minStep: 0.001,
        perms: [
          hap.Characteristic.Perms.PAIRED_READ,
          hap.Characteristic.Perms.NOTIFY,
        ],
      });
      this.value = this.getDefaultValue();
    }
  }

  return (TotalConsumption as unknown) as CharacteristicType;
}

export class WiserSmartPlugAccessory extends BaseAccessory {
  public static readonly CurrentConsumptionUUID =
    'E863F10D-079E-48FF-8F27-9C2605A29F52';
  public static readonly TotalConsumptionUUID =
    'E863F10C-079E-48FF-8F27-9C2605A29F52';

  private readonly currentConsumptionType: CharacteristicType;
  private readonly totalConsumptionType: CharacteristicType;

  constructor(
    accessory: PlatformAccessory,
    hap: HAP,
    log: Logger,
    client: WiserClient,
    private plug: SmartPlugData,
    private device?: Device,
  ) {
    super(accessory, hap, log, client);

    this.currentConsumptionType = createCurrentConsumptionCharacteristic(hap);
    this.totalConsumptionType = createTotalConsumptionCharacteristic(hap);

    this.registerCharacteristic({
      serviceType: this.hap.Service.Outlet,
      characteristicType: this.hap.Characteristic.On,
      getter: () => this.plug.OutputState === 'On',
      setter: this.setOn.bind(this),
    });

    this.registerCharacteristic({
      serviceType: this.hap.Service.Outlet,
      characteristicType: this.hap.Characteristic.OutletInUse,
      getter: () =>
        (this.plug.InstantaneousDemand ?? 0) > 0 ||
        this.plug.OutputState === 'On',
    });

    this.registerCharacteristic({
      serviceType: this.hap.Service.Outlet,
      characteristicType: this.currentConsumptionType,
      getter: () => this.plug.InstantaneousDemand ?? 0,
    });

    this.registerCharacteristic({
      serviceType: this.hap.Service.Outlet,
      characteristicType: this.totalConsumptionType,
      getter: () => (this.plug.CurrentSummationDelivered ?? 0) / 1000,
    });
  }

  private setOn(value: CharacteristicValue): Promise<void> {
    const targetState = Boolean(value);
    return ((this.client as unknown) as {
      setSmartPlugState: (id: number, state: boolean) => Promise<unknown>;
    })
      .setSmartPlugState(this.plug.id, targetState)
      .then(() => {
        this.log.info(
          `SmartPlug ${this.plug.Name} (${this.plug.id}) turned ${
            targetState ? 'ON' : 'OFF'
          }`,
        );
      });
  }

  public update(plug: SmartPlugData, device?: Device): void {
    if (this.plug.OutputState !== plug.OutputState) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Outlet,
        characteristicType: this.hap.Characteristic.On,
        value: plug.OutputState === 'On',
      });
    }

    const wasInUse =
      (this.plug.InstantaneousDemand ?? 0) > 0 ||
      this.plug.OutputState === 'On';
    const isInUse =
      (plug.InstantaneousDemand ?? 0) > 0 || plug.OutputState === 'On';
    if (wasInUse !== isInUse) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Outlet,
        characteristicType: this.hap.Characteristic.OutletInUse,
        value: isInUse,
      });
    }

    if (this.plug.InstantaneousDemand !== plug.InstantaneousDemand) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Outlet,
        characteristicType: this.currentConsumptionType,
        value: plug.InstantaneousDemand ?? 0,
      });
    }

    if (
      this.plug.CurrentSummationDelivered !== plug.CurrentSummationDelivered
    ) {
      this.updateCharacteristic({
        serviceType: this.hap.Service.Outlet,
        characteristicType: this.totalConsumptionType,
        value: (plug.CurrentSummationDelivered ?? 0) / 1000,
      });
    }

    this.plug = plug;
    if (device) {
      this.device = device;
    }
  }
}
