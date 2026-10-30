const fs = require('fs');
const path = require('path');
const initializeSqlJs = require('sql.js');
const seedEvents = require('./seed-events');

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
      capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
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

  const eventColumns = database.exec('PRAGMA table_info(events)')[0].values;
  if (!eventColumns.some(column => column[1] === 'capacity')) {
    database.run('ALTER TABLE events ADD COLUMN capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0)');
  }

  database.exec(`
    CREATE TRIGGER IF NOT EXISTS enforce_event_capacity
    BEFORE INSERT ON registrations
    WHEN (SELECT COUNT(*) FROM registrations WHERE event_id = NEW.event_id) >=
      (SELECT capacity FROM events WHERE id = NEW.event_id)
    BEGIN
      SELECT RAISE(ABORT, 'EVENT_CAPACITY_REACHED');
    END;
  `);

  const eventCount = database.exec('SELECT COUNT(*) FROM events')[0].values[0][0];
  if (Number(eventCount) === 0) {
    const insertEvent = database.prepare(
      'INSERT INTO events (name, description, event_date, event_time, venue, category, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    try {
      for (const [name, description, daysAhead, venue, category, capacity] of seedEvents) {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const eventDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        insertEvent.run([name, description, eventDate, '10:00', venue, category, capacity]);
      }
    } finally {
      insertEvent.free();
    }
  }

  fs.writeFileSync(databasePath, Buffer.from(database.export()));
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
    if (error.message.includes('EVENT_CAPACITY_REACHED')) error.code = 'SQLITE_CONSTRAINT_EVENT_CAPACITY';
    throw error;
  } finally {
    statement.free();
  }
}

module.exports = {
  execute,
  query: execute,
  isPostgres: false
};
