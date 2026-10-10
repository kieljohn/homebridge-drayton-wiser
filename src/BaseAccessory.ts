import {
  Characteristic,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Logger,
  PlatformAccessory,
  Service,
  WithUUID,
} from 'homebridge';
import { WiserClient } from '@string-bean/drayton-wiser-client';
import { HAP } from 'homebridge/lib/api';

export type CharacteristicType = WithUUID<{ new (): Characteristic }>;
export type ServiceType = WithUUID<typeof Service>;
export type CharacteristicPropsType = Parameters<Characteristic['setProps']>[0];

export abstract class BaseAccessory {
  protected constructor(
    protected readonly accessory: PlatformAccessory,
    protected readonly hap: HAP,
    protected readonly log: Logger,
    protected readonly client: WiserClient,
  ) {}

  protected getService(serviceType: ServiceType): Service {
    const service = this.accessory.getService(serviceType);

    if (service) {
      return service;
    }

    const serviceInstance: Service =
      typeof serviceType === 'function'
        ? new ((serviceType as unknown) as { new (): Service })()
        : ((serviceType as unknown) as Service);

    return this.accessory.addService(serviceInstance);
  }

  protected registerCharacteristic({
    serviceType,
    characteristicType,
    getter,
    setter,
    props,
  }: {
    serviceType: ServiceType;
    characteristicType: CharacteristicType;
    getter?: () => CharacteristicValue | undefined;
    setter?: (value: CharacteristicValue) => Promise<void>;
    props?: Partial<CharacteristicPropsType>;
  }): void {
    const service = this.getService(serviceType);
    const characteristic = service.getCharacteristic(characteristicType);

    if (getter) {
      characteristic.on('get', (callback: CharacteristicGetCallback) => {
        try {
          callback(null, getter());
        } catch (error) {
          callback(error as Error);
        }
      });
    }

    if (setter) {
      characteristic.on(
        'set',
        (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          setter(value)
            .then(() => {
              callback();
            })
            .catch((error) => {
              callback(error as Error);
            });
        },
      );
    }

    if (props) {
      characteristic.setProps(props);
    }
  }

  protected updateCharacteristic({
    serviceType,
    characteristicType,
    value,
  }: {
    serviceType: ServiceType;
    characteristicType: CharacteristicType;
    value: CharacteristicValue;
  }): void {
    this.getService(serviceType).updateCharacteristic(
      characteristicType,
      value,
    );
  }
}
