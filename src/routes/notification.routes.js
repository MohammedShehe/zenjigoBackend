const router=require('express').Router(); const c=require('../controllers/notification.controller');
router.get('/',c.list); router.patch('/:id/read',c.read); router.post('/token',c.token); router.delete('/token',c.removeToken); module.exports=router;
