const router=require('express').Router(); const c=require('../controllers/chat.controller'); const {body}=require('express-validator'); const {validate}=require('../utils/validation');
router.get('/',c.list); router.post('/support',c.support); router.post('/ride/:rideId',c.ride); router.get('/:id/messages',c.messages); router.post('/:id/messages',[body('text').isLength({min:1,max:5000})],validate,c.send); router.delete('/:id/messages/:messageId',c.delete);
module.exports=router;
