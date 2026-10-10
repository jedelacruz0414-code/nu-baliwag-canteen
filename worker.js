import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";

const jsonError = (error, status) =>
  Response.json({ error }, { status });

const createDatabaseConnection = hyperdrive =>
  createConnection({
    host: hyperdrive.host,
    port: hyperdrive.port,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    disableEval: true
  });

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
        connection = await createDatabaseConnection(env.HYPERDRIVE);
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

    if (url.pathname === "/api/admin/users" && request.method === "POST") {
      if (!env.HYPERDRIVE) {
        return jsonError("Hyperdrive binding HYPERDRIVE is not configured.", 503);
      }
      if (!env.USER_SETUP_TOKEN) {
        return jsonError("User setup is disabled.", 503);
      }
      if (request.headers.get("authorization") !== `Bearer ${env.USER_SETUP_TOKEN}`) {
        return jsonError("Invalid or missing setup token.", 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError("Request body must be valid JSON.", 400);
      }

      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const schoolId = typeof body?.schoolId === "string" ? body.schoolId.trim() : "";
      const email = typeof body?.email === "string" ? body.email.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";
      if (
        !name ||
        name.length > 120 ||
        !schoolId ||
        schoolId.length > 40 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        password.length < 8 ||
        password.length > 128
      ) {
        return jsonError(
          "Provide a valid name, school ID, email, and password of 8 to 128 characters.",
          400
        );
      }

      let connection;
      try {
        connection = await createDatabaseConnection(env.HYPERDRIVE);
        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await connection.execute(
          "INSERT INTO users (role, name, school_id, email, password_hash) VALUES ('student', ?, ?, ?, ?)",
          [name, schoolId, email, passwordHash]
        );
        return Response.json(
          {
            status: "created",
            user: { id: result.insertId, role: "student", name, schoolId, email }
          },
          { status: 201 }
        );
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") {
          return jsonError("A user with that school ID or email already exists.", 409);
        }
        console.error("Student account creation failed.", error);
        return jsonError("Student account creation failed.", 500);
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
