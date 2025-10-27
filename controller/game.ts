import express from "express";
import multer from "multer";
import path from "path";
import { conn } from "../dbconnect";

export const router = express.Router();

// 🔹 ตั้งค่า multer สำหรับเก็บรูปในโฟลเดอร์ "uploads"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // เช่น: 16965232123.jpg
  },
});

// 🛡 กรองไฟล์เฉพาะ JPEG / PNG
const fileFilter = (
  req: express.Request,
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

const upload = multer({ storage: storage, fileFilter: fileFilter });

// POST เพิ่มเกมใหม่
router.post("/addgame", upload.single("Gimage"), (req, res) => {
  const { Gname, Gprice, sold, category, detail } = req.body;
  const Gimage = req.file ? req.file.filename : null; // ถ้ามีรูป

  if (!Gname || !Gprice || !category || !detail) {
    return res.status(400).json({
      success: false,
      message: "กรอกข้อมูลไม่ครบ",
    });
  }

  const sql =
    "INSERT INTO games (Gname, Gimage, Gprice, sold, category, detail) VALUES (?, ?, ?, ?, ?, ?)";
  conn.query(
    sql,
    [Gname, Gimage, Gprice, sold || 0, category, detail],
    (err, result) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({
          success: false,
          message: "เพิ่มเกมไม่สำเร็จ",
          error: err,
        });
      }

      return res.json({
        success: true,
        message: "เพิ่มเกมสำเร็จ ✅",
        Gimage: Gimage,
      });
    }
  );
});

// GET ดึงข้อมูลเกมทั้งหมด
router.get("/", (req, res) => {
  const sql = "SELECT * FROM games ORDER BY id DESC";
  conn.query(sql, (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถดึงข้อมูลเกมได้",
        error: err,
      });
    }
    res.json(result);
  });
});

// GET ดึงข้อมูลเกมตัวเดียวตาม id
router.get("/:id", (req, res) => {
  const id = req.params.id;

  const sql = "SELECT * FROM games WHERE id = ?";
  conn.query(sql, [id], (err, result: any[]) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถดึงข้อมูลเกมได้",
        error: err,
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบข้อมูลเกมที่ต้องการ",
      });
    }

    res.json(result[0]); // ส่งแค่ตัวเดียว
  });
});

// DELETE ลบเกมตาม id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM games WHERE id = ?';

  conn.query(sql, [id], (err, result) => {
    if (err) {
      console.error('DB ERROR:', err);
      return res.status(500).json({
        success: false,
        message: 'ลบเกมไม่สำเร็จ',
        error: err,
      });
    }

    res.json({
      success: true,
      message: 'ลบเกมสำเร็จ ✅',
    });
  });
});

// PUT อัปเดตเกม (เฉพาะ Gname, Gprice, category, detail, Gimage)
router.put('/:id', upload.single("Gimage"), (req, res) => {
  const id = req.params.id;
  const { Gname, Gprice, category, detail } = req.body;
  const Gimage = req.file ? req.file.filename : null;

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!Gname || !Gprice || !category || !detail) {
    return res.status(400).json({
      success: false,
      message: "กรอกข้อมูลไม่ครบ",
    });
  }

  // สร้าง SQL statement แบบ dynamic ถ้ามีรูปภาพจะเพิ่ม update รูปด้วย
  let sql = `
    UPDATE games SET 
      Gname = ?, 
      Gprice = ?, 
      category = ?, 
      detail = ?
      ${Gimage ? ', Gimage = ?' : ''}
    WHERE id = ?
  `;

  // เตรียม params ให้ตรงกับ SQL
  const params = Gimage
    ? [Gname, Gprice, category, detail, Gimage, id]
    : [Gname, Gprice, category, detail, id];

  conn.query(sql, params, (err, result) => {
    if (err) {
      console.error('DB Error:', err);
      return res.status(500).json({ success: false, message: 'อัปเดตเกมไม่สำเร็จ', error: err });
    }
    res.json({ success: true, message: 'อัปเดตเกมเรียบร้อย ✅' });
  });
});
