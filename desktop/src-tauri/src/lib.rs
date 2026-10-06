mod db;
mod fsops;
mod git;
mod secrets;
mod term;
mod tunnel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(db::Sessions::default())
        .manage(term::Terminals::default())
        .invoke_handler(tauri::generate_handler![
            db::db_test,
            db::db_connect,
            db::db_disconnect,
            db::db_query,
            db::db_cancel,
            db::db_transaction,
            secrets::secret_save,
            secrets::secret_get,
            secrets::secret_remove,
            fsops::fs_home,
            fsops::fs_list,
            fsops::fs_read,
            fsops::fs_write,
            fsops::fs_create_file,
            fsops::fs_create_dir,
            fsops::fs_rename,
            fsops::fs_remove,
            fsops::fs_copy,
            fsops::fs_reveal,
            fsops::fs_detect_project,
            fsops::fs_search,
            term::term_shells,
            term::term_spawn,
            term::term_write,
            term::term_resize,
            term::term_kill,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_log,
            git::git_diff,
            git::git_remotes,
            git::git_run,
            git::git_clone,
            git::git_init,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MySQL Forge Studio");
}
