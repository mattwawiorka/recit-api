module.exports = (req, res, next) => {
    req.userId = 2;
    next();
};