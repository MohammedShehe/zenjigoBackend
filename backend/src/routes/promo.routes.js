const router=require('express').Router(); const c=require('../controllers/promo.controller');
router.get('/',c.list); router.post('/apply',c.apply); module.exports=router;
