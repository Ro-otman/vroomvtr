import { resolveSessionUser } from "../utils/authSession.js";

const authenticate = async (req, res, next) => {
  const user = await resolveSessionUser(req, res);
  if (!user) {
    return res.status(401).json({ message: "Non autorise" });
  }

  req.user = { id: user.id, role: user.role };
  return next();
};

export default authenticate;
