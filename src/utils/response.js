class ApiResponse {
    static success(res, message, data = null, statusCode = 200) {
        return res.status(statusCode).json({ success: true, message, data });
    }
    static error(res, message, statusCode = 400, errors = null) {
        return res.status(statusCode).json({ success: false, message, errors });
    }
    static created(res, message, data = null) {
        return this.success(res, message, data, 201);
    }
    static notFound(res, message = 'Not found') {
        return this.error(res, message, 404);
    }
    static serverError(res, message = 'Internal server error') {
        return this.error(res, message, 500);
    }
}

module.exports = ApiResponse;
