import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file?.mimetype?.startsWith("image/")) {
    return cb(null, true);
  }
  return cb(new Error("Seules les images sont autorisees."));
};

const uploadRefundSteps = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
  },
});

export default uploadRefundSteps;
