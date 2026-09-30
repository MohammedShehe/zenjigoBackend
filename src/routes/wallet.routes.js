const router=require('express').Router(); const c=require('../controllers/wallet.controller');
router.get('/',c.balance); router.get('/transactions',c.transactions); router.post('/topup',c.topup); router.post('/charge',c.charge); module.exports=router;
