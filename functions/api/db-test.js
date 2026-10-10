import { createConnection } from "mysql2/promise";

export async function onRequestGet({ env }) {
  const hyperdrive = env.HYPERDRIVE;
  if (!hyperdrive) {
    return Response.json(
      { status: "error", error: "Hyperdrive binding HYPERDRIVE is not configured." },
      { status: 503 }
    );
  }

  let connection;
  try {
    connection = await createConnection({
      host: hyperdrive.host,
      port: hyperdrive.port,
      user: hyperdrive.user,
      password: hyperdrive.password,
      database: hyperdrive.database,
      disableEval: true
    });
    await connection.query("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Hyperdrive database connectivity check failed.", error);
    return Response.json(
      { status: "error", error: "Database connectivity check failed." },
      { status: 503 }
    );
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (error) {
        console.error("Failed to close the Hyperdrive database connection.", error);
      }
    }
  }
}