<?php
// Lightweight PDO-like wrapper using SQLite3 for environments without pdo_sqlite.
// Only implements methods used in this project.

class PdoLikeSqlite {
    private SQLite3 $db;

    public function __construct(string $file) {
        $this->db = new SQLite3($file);
        // Match behavior: foreign keys on if needed (not critical here)
        @$this->db->exec('PRAGMA foreign_keys = ON');
    }

    public function setAttribute($attr, $value) {
        // no-op for compatibility
        return true;
    }

    public function exec(string $sql) {
        return $this->db->exec($sql);
    }

    public function query(string $sql) {
        $res = $this->db->query($sql);
        if ($res === false) return false;
        return new PdoLikeSqliteResult($res);
    }

    public function prepare(string $sql) {
        $stmt = $this->db->prepare($sql);
        if ($stmt === false) return false;
        return new PdoLikeSqliteStmt($stmt, $this->db);
    }

    public function lastInsertId() {
        return $this->db->lastInsertRowID();
    }
}

class PdoLikeSqliteResult {
    private SQLite3Result $res;

    public function __construct(SQLite3Result $res) {
        $this->res = $res;
    }

    public function fetch() {
        $row = $this->res->fetchArray(SQLITE3_ASSOC);
        return $row ?: false;
    }

    public function fetchAll() {
        $rows = [];
        while ($row = $this->res->fetchArray(SQLITE3_ASSOC)) {
            $rows[] = $row;
        }
        return $rows;
    }
}

class PdoLikeSqliteStmt {
    private SQLite3Stmt $stmt;
    private ?SQLite3Result $result = null;
    private SQLite3 $db;

    public function __construct(SQLite3Stmt $stmt, SQLite3 $db) {
        $this->stmt = $stmt;
        $this->db = $db;
    }

    public function execute(array $params = []) {
        // Bind 1-indexed params
        foreach (array_values($params) as $i => $val) {
            $index = $i + 1;
            $type = SQLITE3_TEXT;
            if (is_int($val)) $type = SQLITE3_INTEGER;
            elseif (is_float($val)) $type = SQLITE3_FLOAT;
            elseif (is_null($val)) $type = SQLITE3_NULL;
            $this->stmt->bindValue($index, $val, $type);
        }
        $this->result = $this->stmt->execute();
        // For non-SELECT statements, SQLite3Result may be false; that's OK.
        return true;
    }

    public function fetch() {
        if (!$this->result) return false;
        $row = $this->result->fetchArray(SQLITE3_ASSOC);
        return $row ?: false;
    }

    public function fetchAll() {
        if (!$this->result) return [];
        $rows = [];
        while ($row = $this->result->fetchArray(SQLITE3_ASSOC)) {
            $rows[] = $row;
        }
        return $rows;
    }
}