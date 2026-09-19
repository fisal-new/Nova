// Nova IDE — desktop binary entry (mobile uses nova_ide::run via JNI).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nova_ide::run();
}
