-- Use the causeconnect database
USE causeconnect;

-- Insert users
INSERT INTO users (email, name, role, password, google_id) VALUES
('john.doe@example.com', 'John Doe', 'user', '$2a$10$wHVdjyKKNK0hG5OcTTwH/ueOGOTViO.fRHzFDFwY/Bmp/zzl1K.d.', '1234567890'),
('jane.smith@example.com', 'Jane Smith', 'organization', '$2a$10$wHVdjyKKNK0hG5OcTTwH/ueOGOTViO.fRHzFDFwY/Bmp/zzl1K.d.', '1234567891'),
('mike.jones@example.com', 'Mike Jones', 'user', '$2a$10$wHVdjyKKNK0hG5OcTTwH/ueOGOTViO.fRHzFDFwY/Bmp/zzl1K.d.', '1234567892'),
('emily.johnson@example.com', 'Emily Johnson', 'admin', '$2a$10$wHVdjyKKNK0hG5OcTTwH/ueOGOTViO.fRHzFDFwY/Bmp/zzl1K.d.', '1234567893'),
('robert.brown@example.com', 'Robert Brown', 'user', '$2a$10$wHVdjyKKNK0hG5OcTTwH/ueOGOTViO.fRHzFDFwY/Bmp/zzl1K.d.', '1234567894');

-- Insert organizations
INSERT INTO organizations (name) VALUES
('Green Earth Initiative'),
('Community Helpers'),
('Tech for Good'),
('Food Rescue'),
('Youth Volunteers United');

-- Insert locations
INSERT INTO locations (name) VALUES
('Central Park'),
('Downtown Community Center'),
('Westside High School'),
('City Library'),
('Eastside Recreation Center');

-- Insert events
INSERT INTO events (user_id, organization_id, location_id, name, time, date, description, approved) VALUES
((SELECT id FROM users WHERE email = 'jane.smith@example.com'), (SELECT id FROM organizations WHERE name = 'Green Earth Initiative'), (SELECT id FROM locations WHERE name = 'Central Park'), 'Park Cleanup', '09:00:00', '2024-07-15', 'Join us for a morning of cleaning up Central Park.', 1),
((SELECT id FROM users WHERE email = 'jane.smith@example.com'), (SELECT id FROM organizations WHERE name = 'Community Helpers'), (SELECT id FROM locations WHERE name = 'Downtown Community Center'), 'Community Health Fair', '10:00:00', '2024-08-05', 'A fair to promote community health and wellness.', 1),
((SELECT id FROM users WHERE email = 'jane.smith@example.com'), (SELECT id FROM organizations WHERE name = 'Tech for Good'), (SELECT id FROM locations WHERE name = 'Westside High School'), 'Coding Bootcamp', '14:00:00', '2024-09-12', 'Learn to code in a day with our experts.', 1),
((SELECT id FROM users WHERE email = 'jane.smith@example.com'), (SELECT id FROM organizations WHERE name = 'Food Rescue'), (SELECT id FROM locations WHERE name = 'City Library'), 'Food Drive', '11:00:00', '2024-07-22', 'Help us collect food for the needy.', 1),
((SELECT id FROM users WHERE email = 'jane.smith@example.com'), (SELECT id FROM organizations WHERE name = 'Youth Volunteers United'), (SELECT id FROM locations WHERE name = 'Eastside Recreation Center'), 'Youth Sports Day', '13:00:00', '2024-07-29', 'A fun day of sports and activities for youth.', 1),
((SELECT id FROM users WHERE email = 'mike.jones@example.com'), (SELECT id FROM organizations WHERE name = 'Green Earth Initiative'), (SELECT id FROM locations WHERE name = 'Central Park'), 'Park Tree Planting', '10:00:00', '2024-07-19', 'Plant trees in Central Park to improve the environment.', 1),
((SELECT id FROM users WHERE email = 'mike.jones@example.com'), (SELECT id FROM organizations WHERE name = 'Community Helpers'), (SELECT id FROM locations WHERE name = 'Downtown Community Center'), 'Blood Donation Camp', '09:00:00', '2024-08-12', 'Donate blood and save lives.', 1),
((SELECT id FROM users WHERE email = 'mike.jones@example.com'), (SELECT id FROM organizations WHERE name = 'Tech for Good'), (SELECT id FROM locations WHERE name = 'Westside High School'), 'Tech Workshop', '15:00:00', '2024-09-20', 'Hands-on workshop on the latest tech trends.', 1),
((SELECT id FROM users WHERE email = 'mike.jones@example.com'), (SELECT id FROM organizations WHERE name = 'Food Rescue'), (SELECT id FROM locations WHERE name = 'City Library'), 'Food Distribution', '12:00:00', '2024-07-25', 'Distribute food to the homeless.', 1),
((SELECT id FROM users WHERE email = 'mike.jones@example.com'), (SELECT id FROM organizations WHERE name = 'Youth Volunteers United'), (SELECT id FROM locations WHERE name = 'Eastside Recreation Center'), 'Youth Leadership Seminar', '14:00:00', '2024-08-01', 'Seminar on developing leadership skills in youth.', 1);
