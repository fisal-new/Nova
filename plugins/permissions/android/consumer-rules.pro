# Keep the Tauri mobile plugin entry point: it is only ever reached via
# reflection (register_android_plugin + @Command dispatch), which R8 cannot
# see — without this, release builds may strip or rename the class and every
# plugin call fails at runtime while looking perfectly fine in code.
-keep class com.nova.permissions.PermissionsPlugin { *; }
-keepclasseswithmembernames class * {
    @app.tauri.annotation.Command <methods>;
}
