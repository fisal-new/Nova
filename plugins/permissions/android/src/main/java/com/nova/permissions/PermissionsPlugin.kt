package com.nova.permissions

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val LEGACY_REQUEST_CODE = 9401

@TauriPlugin
class PermissionsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun checkStorage(invoke: Invoke) {
        val ret = JSObject()
        ret.put("sdk", Build.VERSION.SDK_INT)
        ret.put("legacyGranted", hasLegacyStorage())
        ret.put("allFilesGranted", hasAllFilesAccess())
        ret.put("externalRoot", externalRoot())
        invoke.resolve(ret)
    }

    @Command
    fun requestLegacyStorage(invoke: Invoke) {
        // Fire-and-forget on purpose: permission results are verified by the
        // frontend polling checkStorage (Verify button), so we never depend
        // on activity-callback plumbing.
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ),
            LEGACY_REQUEST_CODE
        )
        val ret = JSObject()
        ret.put("requested", true)
        invoke.resolve(ret)
    }

    @Command
    fun openAllFilesSettings(invoke: Invoke) {
        var opened = false
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:" + activity.packageName)
                )
                activity.startActivity(intent)
                opened = true
            } catch (_: Exception) {
                try {
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                    opened = true
                } catch (_: Exception) {
                    opened = false
                }
            }
        }
        val ret = JSObject()
        ret.put("opened", opened)
        invoke.resolve(ret)
    }

    private fun hasLegacyStorage(): Boolean {
        // Real check on every SDK level (no early-true shortcut): on 30+ the
        // answer is informational only — MANAGE_EXTERNAL_STORAGE governs.
        val r = ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_EXTERNAL_STORAGE)
        val w = ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE)
        return r == PackageManager.PERMISSION_GRANTED && w == PackageManager.PERMISSION_GRANTED
    }

    private fun hasAllFilesAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= 30) {
            try {
                Environment.isExternalStorageManager()
            } catch (_: Exception) {
                false
            }
        } else {
            hasLegacyStorage()
        }
    }

    private fun externalRoot(): String {
        return try {
            @Suppress("DEPRECATION")
            Environment.getExternalStorageDirectory()?.absolutePath ?: ""
        } catch (_: Exception) {
            ""
        }
    }
}
