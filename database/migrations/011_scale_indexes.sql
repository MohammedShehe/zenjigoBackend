-- 011: indexes for many concurrent riders/drivers and live tracking.
CREATE INDEX idx_rides_status_created ON rides (status, created_at);
CREATE INDEX idx_rides_driver_status ON rides (driver_id, status);
CREATE INDEX idx_rides_rider_status ON rides (rider_id, status);
CREATE INDEX idx_driver_online_geo ON driver_profiles (online, application_status, current_lat, current_lng);
CREATE INDEX idx_ride_events_ride_type ON ride_events (ride_id, event_type);
CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);
CREATE INDEX idx_ratings_ride_from ON ratings (ride_id, from_user_id);
