#pragma once

#include "pairing.hpp"
#include "updater.hpp"

SyncOutcome synchronize(DeviceCredential &device);
DeviceCredential pair_device(const Pairing &pairing,
                             const std::string &device_name);
