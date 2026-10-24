const router=require('express').Router(); const {upload}=require('../middleware/upload'); const c=require('../controllers/upload.controller');
router.post('/',upload.single('file'),c.single); module.exports=router;
