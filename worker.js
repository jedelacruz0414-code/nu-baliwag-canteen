import { createConnection } from "mysql2/promise";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/db-test" && request.method === "GET") {
      if (!env.HYPERDRIVE) {
        return Response.json(
          { status: "error", error: "Hyperdrive binding HYPERDRIVE is not configured." },
          { status: 503 }
        );
      }

      let connection;
      try {
        connection = await createConnection({
          host: env.HYPERDRIVE.host,
          port: env.HYPERDRIVE.port,
          user: env.HYPERDRIVE.user,
          password: env.HYPERDRIVE.password,
          database: env.HYPERDRIVE.database,
          disableEval: true
        });
        await connection.query("SELECT 1");
        return Response.json({ status: "ok", database: "connected" });
      } catch (error) {
        console.error("Hyperdrive connectivity check failed.", error);
        return Response.json(
          { status: "error", error: "Database connectivity check failed." },
          { status: 503 }
        );
      } finally {
        if (connection) {
          try {
            await connection.end();
          } catch (error) {
            console.error("Failed to close the Hyperdrive connection.", error);
          }
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
