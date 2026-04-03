'use strict';

const { Router } = require('express');
const transactionController = require('../controllers/transaction.controller');

const router = Router();

router.post('/transactions', transactionController.createTransaction);

module.exports = router;
