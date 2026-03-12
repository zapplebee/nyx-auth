import { Hono } from "hono";
import type { Auth } from "../auth";
import { db } from "../db";
import { hashPassword } from "better-auth/crypto";

export default function adminRouter(auth: Auth) {
  const router = new Hono();

  // ── Admin API key guard ──────────────────────────────────────────────────
  router.use("*", async (c, next) => {
    const authHeader = c.req.header("authorization") ?? "";
    const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!key || key !== process.env.ADMIN_API_KEY) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  // ── Users ────────────────────────────────────────────────────────────────

  // GET /admin/users?search=&limit=&offset=
  router.get("/users", (c) => {
    const search = c.req.query("search") ?? "";
    const limit = Number(c.req.query("limit") ?? 100);
    const offset = Number(c.req.query("offset") ?? 0);

    const rows = search
      ? db
          .query(
            "SELECT id, email, name, role, emailVerified, createdAt, updatedAt, banned, banReason FROM user WHERE email LIKE ? OR name LIKE ? LIMIT ? OFFSET ?"
          )
          .all(`%${search}%`, `%${search}%`, limit, offset)
      : db
          .query(
            "SELECT id, email, name, role, emailVerified, createdAt, updatedAt, banned, banReason FROM user LIMIT ? OFFSET ?"
          )
          .all(limit, offset);

    const total = (
      db.query("SELECT COUNT(*) as count FROM user").get() as { count: number }
    ).count;

    return c.json({ users: rows, total });
  });

  // POST /admin/users
  router.post("/users", async (c) => {
    const body = await c.req.json<{
      email: string;
      password: string;
      name?: string;
      role?: string;
    }>();

    const result = await auth.api.createUser({
      body: {
        email: body.email,
        password: body.password,
        name: body.name ?? body.email,
        role: body.role ?? "user",
      },
    });

    return c.json(result, 201);
  });

  // PATCH /admin/users/:id/password
  router.patch("/users/:id/password", async (c) => {
    const { id } = c.req.param();
    const { password } = await c.req.json<{ password: string }>();

    const hashed = await hashPassword(password);
    const updated = db
      .query(
        "UPDATE account SET password = ? WHERE userId = ? AND providerId = 'credential'"
      )
      .run(hashed, id);

    if (updated.changes === 0) {
      return c.json({ error: "user not found or has no password credential" }, 404);
    }
    return c.json({ success: true });
  });

  // PATCH /admin/users/:id/role
  router.patch("/users/:id/role", (c) => {
    const { id } = c.req.param();
    return c.req.json<{ role: string }>().then(({ role }) => {
      const updated = db
        .query("UPDATE user SET role = ? WHERE id = ?")
        .run(role, id);
      if (updated.changes === 0) return c.json({ error: "user not found" }, 404);
      return c.json({ success: true });
    });
  });

  // DELETE /admin/users/:id
  router.delete("/users/:id", (c) => {
    const { id } = c.req.param();
    db.query("DELETE FROM account WHERE userId = ?").run(id);
    db.query("DELETE FROM session WHERE userId = ?").run(id);
    db.query("DELETE FROM oauthConsent WHERE userId = ?").run(id);
    const deleted = db.query("DELETE FROM user WHERE id = ?").run(id);
    if (deleted.changes === 0) return c.json({ error: "user not found" }, 404);
    return c.json({ success: true });
  });

  // POST /admin/users/:id/ban
  router.post("/users/:id/ban", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ reason?: string; expiresAt?: string }>();
    db.query(
      "UPDATE user SET banned = 1, banReason = ?, banExpires = ? WHERE id = ?"
    ).run(body.reason ?? null, body.expiresAt ?? null, id);
    return c.json({ success: true });
  });

  // POST /admin/users/:id/unban
  router.post("/users/:id/unban", (c) => {
    const { id } = c.req.param();
    db.query(
      "UPDATE user SET banned = 0, banReason = NULL, banExpires = NULL WHERE id = ?"
    ).run(id);
    return c.json({ success: true });
  });

  return router;
}
