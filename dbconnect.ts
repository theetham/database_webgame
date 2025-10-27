import mysql, { Connection } from "mysql2";

export const conn: Connection = mysql.createConnection({
  host: "202.28.34.210",
  user: "66011212143",
  password: "66011212143",
  database: "db66011212143",
  port: 3309,
});
