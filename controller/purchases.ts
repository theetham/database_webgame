// routes/purchases.ts
import express from "express";
import { conn } from "../dbconnect";

export const router = express.Router();

/**
 * GET /purchases/:userId
 * ดึงรายการเกมที่ user ซื้อแล้ว (join กับตาราง games เพื่อดึงข้อมูลเกมมาด้วย)
 */
router.get("/:userId", (req, res) => {
  const userId = req.params.userId;
  const sql = `
    SELECT g.* , gp.purchase_date
    FROM game_purchases gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ?
    ORDER BY gp.purchase_date DESC
  `;
  conn.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("DB ERROR (get purchases):", err);
      return res.status(500).json({ success: false, message: "ดึงรายการที่ซื้อแล้วล้มเหลว", error: err });
    }
    return res.json({ success: true, data: results });
  });
});

/**
 * POST /purchases/check
 * ตรวจสอบว่า user เคยซื้อ game นี้แล้วหรือไม่
 * body: { userId, gameId }
 */
router.post("/check", (req, res) => {
  const { userId, gameId } = req.body;
  if (!userId || !gameId) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบ" });
  }

  const sql = "SELECT COUNT(*) as cnt FROM game_purchases WHERE user_id = ? AND game_id = ?";
  conn.query(sql, [userId, gameId], (err, results: any[]) => {
    if (err) {
      console.error("DB ERROR (check purchase):", err);
      return res.status(500).json({ success: false, message: "ตรวจสอบล้มเหลว", error: err });
    }
    const purchased = results[0].cnt > 0;
    return res.json({ success: true, purchased });
  });
});

/**
 * POST /purchases/buy
 * ซื้อหลายเกมพร้อมกัน (bulk)
 * body: { userId, gameIds: number[], totalPrice }
 *
 * เงื่อนไข:
 * - ถ้า user เคยซื้อเกมใดแล้ว จะส่งกลับ error พร้อมรายการเกมที่ซ้ำ
 * - เช็คยอด balance ก่อนหัก
 * - ใช้ transaction เพื่อให้ข้อมูลคงที่ (update users, insert wallet, insert game_purchases)
 */
router.post("/buy", (req, res) => {
  const { userId, gameIds, totalPrice } = req.body;

  if (!userId || !Array.isArray(gameIds) || gameIds.length === 0 || totalPrice == null) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบ" });
  }

  // 1) ตรวจสอบว่ามีเกมซ้ำ (user เคยซื้อแล้ว) หรือไม่
  const placeholders = gameIds.map(() => "?").join(",");
  const checkSql = `SELECT game_id FROM game_purchases WHERE user_id = ? AND game_id IN (${placeholders})`;
  conn.query(checkSql, [userId, ...gameIds], (err, existingRows: any[]) => {
    if (err) {
      console.error("DB ERROR (check existing purchases):", err);
      return res.status(500).json({ success: false, message: "ตรวจสอบการซื้อซ้ำล้มเหลว", error: err });
    }

    const alreadyBoughtIds = existingRows.map((r) => r.game_id);
    if (alreadyBoughtIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "มีเกมที่คุณเคยซื้อไปแล้ว",
        duplicates: alreadyBoughtIds,
      });
    }

    // 2) ดึง balance ปัจจุบัน
    const balanceSql = "SELECT balance FROM users WHERE id = ?";
    conn.query(balanceSql, [userId], (err2, balResults: any[]) => {
      if (err2) {
        console.error("DB ERROR (get balance):", err2);
        return res.status(500).json({ success: false, message: "ดึงยอดเงินล้มเหลว", error: err2 });
      }
      if (!balResults || balResults.length === 0) {
        return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
      }

      const balance = parseFloat(balResults[0].balance || 0);
      const total = parseFloat(totalPrice);

      if (balance < total) {
        return res.status(400).json({ success: false, message: "เงินไม่พอ" });
      }

      // 3) เริ่ม transaction
      conn.beginTransaction((tranErr) => {
        if (tranErr) {
          console.error("TRANSACTION ERROR:", tranErr);
          return res.status(500).json({ success: false, message: "เริ่ม transaction ไม่ได้", error: tranErr });
        }

        // a) อัปเดตยอดเงินผู้ใช้
        const newBalance = balance - total;
        const updateSql = "UPDATE users SET balance = ? WHERE id = ?";
        conn.query(updateSql, [newBalance, userId], (errUpd) => {
          if (errUpd) {
            console.error("DB ERROR (update balance):", errUpd);
            return conn.rollback(() => {
              res.status(500).json({ success: false, message: "อัปเดตยอดเงินล้มเหลว", error: errUpd });
            });
          }

          // b) บันทึกประวัติใน wallet (type = 'purchase')
          const walletSql = "INSERT INTO wallet (type, money, owner) VALUES (?, ?, ?)";
          // บันทึกเป็นจำนวนบวก แต่ใน UI เราจะตีความว่าเป็นรายการซื้อ (หรือจะเก็บ negative ก็ได้ตาม schema)
          conn.query(walletSql, ["purchase", total, userId], (errWallet) => {
            if (errWallet) {
              console.error("DB ERROR (insert wallet):", errWallet);
              return conn.rollback(() => {
                res.status(500).json({ success: false, message: "บันทึก wallet ล้มเหลว", error: errWallet });
              });
            }

            // c) บันทึกแต่ละเกมลง game_purchases (bulk insert)
            const now = new Date();
            const values = gameIds.map((gid: number) => [userId, gid, now]);
            const insertSql = "INSERT INTO game_purchases (user_id, game_id, purchase_date) VALUES ?";
            conn.query(insertSql, [values], (errInsert) => {
              if (errInsert) {
                console.error("DB ERROR (insert game_purchases):", errInsert);
                return conn.rollback(() => {
                  res.status(500).json({ success: false, message: "บันทึกการซื้อล้มเหลว", error: errInsert });
                });
              }

              // ทั้งหมดเรียบร้อย -> commit
              conn.commit((commitErr) => {
                if (commitErr) {
                  console.error("COMMIT ERROR:", commitErr);
                  return conn.rollback(() => {
                    res.status(500).json({ success: false, message: "commit ล้มเหลว", error: commitErr });
                  });
                }

                return res.json({
                  success: true,
                  message: "ซื้อเกมสำเร็จ ✅",
                  newBalance,
                });
              });
            });
          });
        });
      }); // end transaction
    });
  });
});

export default router;
