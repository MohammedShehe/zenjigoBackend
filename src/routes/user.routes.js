const router=require('express').Router(); const c=require('../controllers/user.controller');
router.get('/me',c.me); router.patch('/me',c.update);
router.get('/saved-locations',c.savedList); router.post('/saved-locations',c.savedCreate); router.delete('/saved-locations/:id',c.savedDelete);
router.get('/payment-methods',c.paymentMethods); router.post('/payment-methods',c.paymentCreate); router.patch('/payment-methods/:id/default',c.paymentDefault); router.delete('/payment-methods/:id',c.paymentDelete);
module.exports=router;
