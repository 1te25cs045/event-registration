const fs = require('fs');
const path = require('path');
const initializeSqlJs = require('sql.js');

const databasePath = path.join(__dirname, 'event_registration.db');
const wasmDirectory = path.dirname(require.resolve('sql.js'));

const databaseReady = initializeSqlJs({
  locateFile: file => path.join(wasmDirectory, file)
}).then(SQL => {
  const database = fs.existsSync(databasePath)
    ? new SQL.Database(fs.readFileSync(databasePath))
    : new SQL.Database();

  database.run('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      usn TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      venue TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Technical', 'Cultural', 'Sports', 'Workshops')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, event_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  return database;
});

async function execute(sql, params = []) {
  const database = await databaseReady;
  const statement = database.prepare(sql, params);

  try {
    if (statement.getColumnNames().length) {
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return [rows];
    }

    statement.step();
    const result = {
      insertId: Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0]),
      affectedRows: database.getRowsModified()
    };
    if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) {
      fs.writeFileSync(databasePath, Buffer.from(database.export()));
    }
    return [result];
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) error.code = 'SQLITE_CONSTRAINT_UNIQUE';
    throw error;
  } finally {
    statement.free();
  }
}

module.exports = {
  execute,
  query: execute
};
