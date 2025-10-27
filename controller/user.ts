import express from "express";
import multer from "multer";
import path from "path";
import { conn } from "../dbconnect";

export const router = express.Router();

// ตั้งค่า multer สำหรับอัปโหลดรูป
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = ["image/jpeg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage: storage });

// ✅ สมัครสมาชิก
router.post("/register", upload.single("image"), (req, res) => {
  const { username, email, password } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "กรอกข้อมูลไม่ครบ",
    });
  }

  const sql =
    "INSERT INTO users (username, email, password, image) VALUES (?, ?, ?, ?)";
  conn.query(sql, [username, email, password, image], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "บันทึกข้อมูลไม่สำเร็จ",
        error: err,
      });
    }

    return res.json({
      success: true,
      message: "สมัครสมาชิกสำเร็จ ✅",
      image: image,
    });
  });
});

// ✅ เข้าสู่ระบบ
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "กรอกข้อมูลไม่ครบ" });
  }

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  conn.query(sql, [email, password], (err, results: any) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res
        .status(500)
        .json({ success: false, message: "เกิดข้อผิดพลาดในระบบ" });
    }

    if (results.length > 0) {
      const user = results[0];
      return res.json({
        success: true,
        message: "เข้าสู่ระบบสำเร็จ",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          balance: user.balance,
        },
      });
    } else {
      return res.json({
        success: false,
        message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      });
    }
  });
});

// ✅ ดูโปรไฟล์
router.get("/profile/:id", (req, res) => {
  const id = req.params.id;

  // ดึงข้อมูลผู้ใช้จากตาราง users
  const userSql =
    "SELECT id, username, email, image, role, balance FROM users WHERE id = ?";
  conn.query(userSql, [id], (err, userResults: any[]) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res
        .status(500)
        .json({ success: false, message: "ดึงข้อมูลผู้ใช้ล้มเหลว" });
    }

    if (userResults.length === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    const user = userResults[0];

    // ดึงประวัติการเติมเงินจากตาราง wallet โดยเช็คว่า owner ตรงกับ user id
    const walletSql =
      "SELECT * FROM wallet WHERE owner = ? ORDER BY date DESC LIMIT 5";
    conn.query(walletSql, [id], (err2, walletResults) => {
      if (err2) {
        console.error("DB ERROR:", err2);
        return res
          .status(500)
          .json({ success: false, message: "ดึงประวัติการเติมเงินล้มเหลว" });
      }

      return res.json({
        success: true,
        data: {
          ...user,
          topup_history: walletResults, // ส่งข้อมูลประวัติการเติมเงิน
        },
      });
    });
  });
});

// ✅ แก้ไขโปรไฟล์
router.put("/profile/:id", (req, res) => {
  const id = req.params.id;
  const { username, email } = req.body;

  if (!username || !email) {
    return res
      .status(400)
      .json({ success: false, message: "กรอกข้อมูลไม่ครบ" });
  }

  const sql = "UPDATE users SET username = ?, email = ? WHERE id = ?";
  conn.query(sql, [username, email, id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res
        .status(500)
        .json({ success: false, message: "อัปเดตไม่สำเร็จ" });
    }
    return res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ ✅" });
  });
});

// ✅ เติมเงิน
router.post("/topup", (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || amount == null) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบ" });
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "จำนวนเงินไม่ถูกต้อง" });
  }

  console.log("Received userId:", userId);
  console.log("Received amount:", amt);

  // อัปเดตยอดเงินในฐานข้อมูล
  const sqlUpdate = `UPDATE users SET balance = balance + ? WHERE id = ?`;
  conn.query(sqlUpdate, [amt, userId], (err, result) => {
    if (err) {
      console.error("Balance update failed:", err);
      return res
        .status(500)
        .json({ success: false, message: "อัปเดตยอดเงินล้มเหลว" });
    }

    // เพิ่มประวัติการเติมเงิน
    const sqlWallet = `INSERT INTO wallet (type, money, owner) VALUES (?, ?, ?)`;
    conn.query(sqlWallet, ["topup", amt, userId], (err, result) => {
      if (err) {
        console.error("Wallet insert failed:", err);
        return res
          .status(500)
          .json({ success: false, message: "บันทึกประวัติล้มเหลว" });
      }

      res.json({ success: true, message: "เติมเงินสำเร็จ ✅" });
    });
  });

  // ดึงข้อมูลผู้ใช้ทั้งหมด
  router.get("/user", (req, res) => {
    const sql = "SELECT id, username, email, role, image FROM users";
    conn.query(sql, (err, results) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res
          .status(500)
          .json({ success: false, message: "ดึงข้อมูลผู้ใช้ล้มเหลว" });
      }
      res.json(results);
    });
  });
});

// ซื้อเกม → หัก balance
router.post("/purchase", (req, res) => {
  const { userId, totalPrice } = req.body;

  if (!userId || totalPrice == null) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบ" });
  }

  // ดึง balance ปัจจุบัน
  const sqlBalance = "SELECT balance FROM users WHERE id = ?";
  conn.query(sqlBalance, [userId], (err, results: any) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ success: false, message: "เกิดข้อผิดพลาด" });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    const balance = results[0].balance;
    if (balance < totalPrice) {
      return res.json({ success: false, message: "เงินไม่พอ" });
    }

    // หัก balance
    const newBalance = balance - totalPrice;
    const sqlUpdate = "UPDATE users SET balance = ? WHERE id = ?";
    conn.query(sqlUpdate, [newBalance, userId], (err, result) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "อัปเดตยอดเงินล้มเหลว" });
      }

      // เพิ่มประวัติการซื้อเกม (option)
      const sqlWallet =
        "INSERT INTO wallet (type, money, owner) VALUES (?, ?, ?)";
      conn.query(sqlWallet, ["purchase", totalPrice, userId], (err, result) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ success: false, message: "บันทึกประวัติซื้อเกมล้มเหลว" });
        }

        res.json({ success: true, message: "ซื้อเกมสำเร็จ ✅", newBalance });
      });
    });
  });
});
