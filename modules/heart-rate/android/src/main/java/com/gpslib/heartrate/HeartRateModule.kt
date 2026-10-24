package com.gpslib.heartrate

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

class HeartRateModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var scanner: android.bluetooth.le.BluetoothLeScanner? = null
  private var gatt: BluetoothGatt? = null
  private var connectedDeviceId: String? = null
  private var scanning = false

  private val hrServiceUuid = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
  private val hrMeasurementUuid = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
  private val batteryServiceUuid = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb")
  private val batteryLevelUuid = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb")
  private val cccdUuid = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  override fun definition() = ModuleDefinition {
    Name("HeartRate")

    Events("onDeviceFound", "onScanStateChanged", "onConnectionStateChanged", "onHeartRate", "onBatteryLevel")

    OnDestroy {
      try { scanner?.stopScan(scanCallback) } catch (_: Exception) {}
      scanning = false
      try { gatt?.disconnect() } catch (_: Exception) {}
      try { gatt?.close() } catch (_: Exception) {}
      gatt = null
      connectedDeviceId = null
      scope.cancel()
    }

    AsyncFunction("getCapabilities") {
      mapOf(
        "canScan" to true,
        "canConnect" to true,
        "platform" to "android"
      )
    }

    AsyncFunction("startScan") {
      val ctx = appContext.reactContext ?: throw Exception("No context")
      val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      bluetoothAdapter = manager.adapter
      val adapter = bluetoothAdapter ?: throw Exception("Bluetooth not available")
      if (!adapter.isEnabled) throw Exception("Bluetooth is disabled")
      scanner = adapter.bluetoothLeScanner ?: throw Exception("Scanner unavailable")
      if (scanning) return@AsyncFunction null
      scanning = true
      sendEvent("onScanStateChanged", mapOf("scanning" to true))
      val settings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build()
      scanner?.startScan(null, settings, scanCallback)
      scope.launch {
        delay(10000)
        stopScanInternal()
      }
    }

    AsyncFunction("stopScan") {
      stopScanInternal()
    }

    AsyncFunction("connectToDevice") { deviceId: String ->
      val ctx = appContext.reactContext ?: throw Exception("No context")
      val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      bluetoothAdapter = manager.adapter
      val device = bluetoothAdapter?.getRemoteDevice(deviceId) ?: throw Exception("Unknown device")
      sendEvent("onConnectionStateChanged", mapOf("deviceId" to deviceId, "state" to "connecting"))
      gatt = device.connectGatt(ctx, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    AsyncFunction("disconnectFromDevice") { deviceId: String ->
      gatt?.disconnect()
      gatt?.close()
      gatt = null
      connectedDeviceId = null
      sendEvent("onConnectionStateChanged", mapOf("deviceId" to deviceId, "state" to "disconnected"))
    }

    AsyncFunction("startHrStreaming") { _deviceId: String ->
      // Streaming starts automatically after service discovery.
    }

    AsyncFunction("stopHrStreaming") { _deviceId: String ->
      // No-op: GATT notifications remain; disconnect to fully stop.
    }

    AsyncFunction("getConnectedDeviceId") {
      connectedDeviceId
    }
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val device = result.device
      val name = device.name ?: "Unknown"
      if (!name.contains("Polar", ignoreCase = true) && result.scanRecord?.serviceUuids?.contains(ParcelUuid(hrServiceUuid)) != true) {
        return
      }
      sendEvent("onDeviceFound", mapOf(
        "id" to device.address,
        "name" to name,
        "rssi" to result.rssi
      ))
    }
    override fun onScanFailed(errorCode: Int) {
      scanning = false
      sendEvent("onScanStateChanged", mapOf("scanning" to false))
      Log.e("HeartRate", "Scan failed: $errorCode")
    }
  }

  private fun stopScanInternal() {
    if (!scanning) return
    scanning = false
    try { scanner?.stopScan(scanCallback) } catch (_: Exception) {}
    sendEvent("onScanStateChanged", mapOf("scanning" to false))
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      val id = gatt.device.address
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        connectedDeviceId = id
        this@HeartRateModule.gatt = gatt
        sendEvent("onConnectionStateChanged", mapOf("deviceId" to id, "state" to "connected"))
        gatt.discoverServices()
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        connectedDeviceId = null
        this@HeartRateModule.gatt = null
        sendEvent("onConnectionStateChanged", mapOf("deviceId" to id, "state" to "disconnected"))
        try { gatt.close() } catch (_: Exception) {}
      }
    }
    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val service = gatt.getService(hrServiceUuid) ?: return
      val characteristic = service.getCharacteristic(hrMeasurementUuid) ?: return
      gatt.setCharacteristicNotification(characteristic, true)
      val descriptor = characteristic.getDescriptor(cccdUuid)
      descriptor?.let {
        it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        gatt.writeDescriptor(it)
      }

      val batteryService = gatt.getService(batteryServiceUuid)
      val batteryChar = batteryService?.getCharacteristic(batteryLevelUuid)
      if (batteryChar != null) {
        gatt.readCharacteristic(batteryChar)
      }
    }
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (characteristic.uuid != hrMeasurementUuid) return
      // Notifications arrive on a binder thread, so an exception here would take
      // the whole app down. A malformed or truncated frame from a non-conforming
      // strap must only cost that one sample.
      try {
        parseHr(characteristic.value, gatt.device.address)
      } catch (error: Exception) {
        Log.w("HeartRate", "Dropping malformed heart-rate measurement", error)
      }
    }

    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) return
      if (characteristic.uuid == batteryLevelUuid) {
        val level = characteristic.value?.firstOrNull()?.toInt()?.and(0xFF)
        if (level != null) {
          sendEvent("onBatteryLevel", mapOf(
            "deviceId" to gatt.device.address,
            "level" to level
          ))
        }
      }
    }
  }

  /**
   * Parses one Heart Rate Measurement (0x2A37) notification.
   *
   * Layout per the BLE spec: flags byte, then the heart-rate value (1 byte, or
   * 2 bytes little-endian when flags bit 0 is set), then the optional energy
   * expended field (bit 3), then optional RR intervals (bit 4, each a 1/1024 s
   * uint16). The sensor contact feature lives in bits 1-2: bit 2 means "contact
   * status is supported", bit 1 means "contact detected" - they are read
   * separately, so a strap that reports support without detection is not
   * mistaken for a reading.
   *
   * Every read is preceded by a length check: a truncated frame must not index
   * past the payload.
   */
  private fun parseHr(data: ByteArray, deviceId: String) {
    if (data.size < 2) return
    val flags = data[0].toInt() and 0xFF
    val hrIs16Bit = (flags and 0x01) != 0
    val hrBytes = if (hrIs16Bit) 2 else 1
    if (data.size < 1 + hrBytes) return

    var offset = 1
    val hr = if (hrIs16Bit) {
      ((data[offset + 1].toInt() and 0xFF) shl 8) or (data[offset].toInt() and 0xFF)
    } else {
      data[offset].toInt() and 0xFF
    }
    offset += hrBytes

    // Energy expended is a uint16 that this app does not use; skip it so the RR
    // intervals stay aligned.
    if ((flags and 0x08) != 0) {
      offset += 2
    }

    val rrMs = mutableListOf<Int>()
    if ((flags and 0x10) != 0) {
      while (offset + 1 < data.size) {
        val rr = ((data[offset + 1].toInt() and 0xFF) shl 8) or (data[offset].toInt() and 0xFF)
        rrMs.add((rr * 1000.0 / 1024.0).toInt())
        offset += 2
      }
    }

    val contactSupported = (flags and 0x04) != 0
    val contact = if (contactSupported) (flags and 0x02) != 0 else null
    sendEvent("onHeartRate", mapOf(
      "deviceId" to deviceId,
      "hr" to hr,
      "rrMs" to rrMs,
      "contact" to contact,
      "receivedAt" to System.currentTimeMillis()
    ))
  }

}
