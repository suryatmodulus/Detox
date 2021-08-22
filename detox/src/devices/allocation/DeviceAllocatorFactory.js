const environment = require('../../utils/environment');
const { DeviceAllocator, DeviceDeallocator } = require('./DeviceAllocator');

/**
 * @param deviceConfig { Object}
 * @param eventEmitter { AsyncEmitter }
 * @returns { { allocDriver: DeviceAllocator, deallocDriver: (deviceCookie: DeviceCookie) => DeviceDeallocator} }
 */
function createDeviceAllocator(deviceConfig, eventEmitter) {
  const {
    allocDriver,
    createDeallocDriver,
  } = _createAllocationDriver(deviceConfig, eventEmitter);

  return {
    allocator: new DeviceAllocator(allocDriver),
    createDeallocator: (deviceCookie) => new DeviceDeallocator(createDeallocDriver(deviceCookie)),
  };
}

function _createAllocationDriver(deviceConfig, eventEmitter) {
  switch (deviceConfig.type) {
    case 'android.emulator':
      return _createEmulatorAllocationDriver(eventEmitter);
    case 'android.genycloud':
      return _createGenyAllocationDriver(eventEmitter);
    case 'android.attached':
      return _createAttachedAndroidAllocationDriver(eventEmitter);
    case 'ios.simulator':
      return _createIosSimulatorAllocationDriver(eventEmitter);
    default:
      break; // TODO ASDASD
  }
}

function _createEmulatorAllocationDriver(eventEmitter) {
  const ADB = require('../common/drivers/android/exec/ADB');
  const { EmulatorExec } = require('../common/drivers/android/emulator/exec/EmulatorExec');
  const AVDsResolver = require('./drivers/android/emulator/AVDsResolver');
  const EmulatorVersionResolver = require('./drivers/android/emulator/EmulatorVersionResolver');
  const AVDValidator = require('./drivers/android/emulator/AVDValidator');
  const FreeEmulatorFinder = require('./drivers/android/emulator/FreeEmulatorFinder');
  const EmulatorLauncher = require('./drivers/android/emulator/EmulatorLauncher');
  const EmulatorDeviceAllocation = require('./drivers/android/emulator/EmulatorDeviceAllocation');
  const DeviceRegistryFactory = require('../runtime/drivers/android/genycloud/GenyDeviceRegistryFactory');
  const {
    EmulatorAllocDriver,
    EmulatorDeallocDriver,
  } = require('./drivers/android/emulator/EmulatorAllocDriver');

  const adb = new ADB();
  const emulatorExec = new EmulatorExec();

  const avdsResolver = new AVDsResolver(emulatorExec);
  const emulatorVersionResolver = new EmulatorVersionResolver(emulatorExec);
  const avdValidator = new AVDValidator(avdsResolver, emulatorVersionResolver);
  const deviceRegistry = DeviceRegistryFactory.forRuntime();

  const freeEmulatorFinder = new FreeEmulatorFinder(adb, deviceRegistry);
  const emulatorLauncher = new EmulatorLauncher({ adb, emulatorExec, eventEmitter });
  const deviceAllocation = new EmulatorDeviceAllocation(deviceRegistry, freeEmulatorFinder);
  const allocDriver = new EmulatorAllocDriver({
    adb,
    avdValidator,
    emulatorVersionResolver,
    emulatorLauncher,
    deviceAllocation,
  });
  const createDeallocDriver = (deviceCookie) => new EmulatorDeallocDriver(deviceCookie.adbName, {
    emulatorLauncher,
    deviceAllocation,
  });
  return {
    allocDriver,
    createDeallocDriver,
  }
}

function _createGenyAllocationDriver(eventEmitter) {
  const ADB = require('../common/drivers/android/exec/ADB');
  const Exec = require('../common/drivers/android/genycloud/exec/GenyCloudExec')
  const InstanceNaming = require('../common/drivers/android/genycloud/services/GenyInstanceNaming');
  const RecipesService = require('../common/drivers/android/genycloud/services/GenyRecipesService');
  const InstanceLookupService = require('../common/drivers/android/genycloud/services/GenyInstanceLookupService');
  const InstanceLifecycleService = require('../common/drivers/android/genycloud/services/GenyInstanceLifecycleService');
  const DeviceRegistryFactory = require('../runtime/drivers/android/genycloud/GenyDeviceRegistryFactory');

  const RecipeQuerying = require('./drivers/android/genycloud/GenyRecipeQuerying');
  const InstanceAllocation = require('./drivers/android/genycloud/GenyInstanceAllocation');
  const InstanceLauncher = require('./drivers/android/genycloud/GenyInstanceLauncher');
  const {
    GenyAllocDriver,
    GenyDeallocDriver,
  } = require('./drivers/android/genycloud/GenyAllocDriver');

  const adb = new ADB();
  const genycloudExec = new Exec(environment.getGmsaasPath());
  const instanceNaming = new InstanceNaming(); // TODO should consider a permissive impl for debug/dev mode. Maybe even a custom arg in package.json (Detox > ... > genycloud > sharedAccount: false)
  const deviceRegistry = DeviceRegistryFactory.forRuntime();
  const deviceCleanupRegistry = DeviceRegistryFactory.forGlobalShutdown();

  const recipeService = new RecipesService(genycloudExec);
  const instanceLookupService = new InstanceLookupService(genycloudExec, instanceNaming, deviceRegistry);
  const instanceLifecycleService = new InstanceLifecycleService(genycloudExec, instanceNaming);
  const recipeQuerying = new RecipeQuerying(recipeService);
  const instanceAllocation = new InstanceAllocation({ deviceRegistry, instanceLookupService, instanceLifecycleService });
  const instanceLauncher = new InstanceLauncher({ instanceLifecycleService, instanceLookupService, deviceCleanupRegistry, eventEmitter });
  const allocDriver = new GenyAllocDriver({
    adb,
    recipeQuerying,
    instanceAllocation,
    instanceLauncher,
  });
  const createDeallocDriver = (deviceCookie) =>
    new GenyDeallocDriver(deviceCookie.instance, { instanceAllocation, instanceLauncher });

  return {
    allocDriver,
    createDeallocDriver,
  }
}

function _createAttachedAndroidAllocationDriver(eventEmitter) {
  const ADB = require('../common/drivers/android/exec/ADB');
  const DeviceRegistry = require('../DeviceRegistry');
  const FreeDeviceFinder = require('../common/drivers/android/tools/FreeDeviceFinder');
  const AttachedAndroidLauncher = require('./drivers/android/attached/AttachedAndroidLauncher');
  const {
    AttachedAndroidAllocDriver,
    AttachedAndroidDeallocDriver,
  } = require('./drivers/android/attached/AttachedAndroidAllocDriver');

  const adb = new ADB();
  const deviceRegistry = DeviceRegistry.forAndroid();
  const freeDeviceFinder = new FreeDeviceFinder(adb, deviceRegistry);
  const attachedAndroidLauncher = new AttachedAndroidLauncher(eventEmitter);

  const allocDriver = new AttachedAndroidAllocDriver({ adb, deviceRegistry, freeDeviceFinder, attachedAndroidLauncher });
  const createDeallocDriver = (deviceCookie) =>
    new AttachedAndroidDeallocDriver(deviceCookie.adbName, { deviceRegistry });

  return {
    allocDriver,
    createDeallocDriver,
  }
}

function _createIosSimulatorAllocationDriver(eventEmitter) {
  const DeviceRegistry = require('../DeviceRegistry');
  const AppleSimUtils = require('../common/drivers/ios/tools/AppleSimUtils');
  const SimulatorLauncher = require('./drivers/ios/SimulatorLauncher');
  const { SimulatorAllocDriver, SimulatorDeallocDriver } = require('./drivers/ios/SimulatorAllocDriver');

  const applesimutils = new AppleSimUtils();
  const simulatorLauncher = new SimulatorLauncher({ applesimutils, eventEmitter });
  const deviceRegistry = DeviceRegistry.forIOS();

  const allocDriver = new SimulatorAllocDriver({ eventEmitter, deviceRegistry, applesimutils, simulatorLauncher });
  const createDeallocDriver = (deviceCookie) =>
    new SimulatorDeallocDriver(deviceCookie.udid, { deviceRegistry, simulatorLauncher });

  return {
    allocDriver,
    createDeallocDriver,
  };
}

module.exports = {
  createDeviceAllocator,
};
