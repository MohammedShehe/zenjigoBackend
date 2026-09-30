const router=require('express').Router(); const {body}=require('express-validator'); const {validate}=require('../utils/validation'); const c=require('../controllers/ride.controller');
const coords=[body('pickupLat').isFloat({min:-90,max:90}),body('pickupLng').isFloat({min:-180,max:180}),body('destinationLat').isFloat({min:-90,max:90}),body('destinationLng').isFloat({min:-180,max:180})];
router.post('/quote',[body('rideType').isIn(['boda','bajaji','taxi']),...coords],validate,c.quote);
router.post('/',[body('rideType').isIn(['boda','bajaji','taxi']),body('pickupAddress').notEmpty(),body('destinationAddress').notEmpty(),body('paymentMethod').optional().isIn(['cash','wallet','momo','bank','card']),...coords],validate,c.create);
router.get('/',c.list); router.get('/:id',c.get); router.get('/:id/track',c.track); router.post('/:id/cancel',c.cancel); router.post('/:id/rating',[body('stars').isInt({min:1,max:5})],validate,c.rate);
module.exports=router;
