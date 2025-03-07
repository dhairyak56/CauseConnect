-- Drop existing database if it exists
DROP DATABASE IF EXISTS causeconnect;

-- Drop existing user if it exists
DROP USER IF EXISTS 'causeconnect'@'localhost';

-- Grant all privileges to the user on the causeconnect database
GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;

-- Create the database
CREATE DATABASE causeconnect;

-- Use the newly created database
USE causeconnect;

-- Create tables

-- Users table
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) DEFAULT 'user',
    role ENUM('user', 'organization', 'admin') DEFAULT 'user',
    password VARCHAR(255) DEFAULT NULL,
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organizations table
DROP TABLE IF EXISTS organizations;
CREATE TABLE organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- Locations table
DROP TABLE IF EXISTS locations;
CREATE TABLE locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- Events table
DROP TABLE IF EXISTS events;
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    organization_id INT NOT NULL,
    location_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    time TIME NOT NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    approved TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- RSVPs table
DROP TABLE IF EXISTS rsvps;
CREATE TABLE rsvps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    event_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Insert admin user
INSERT INTO users (email, name, role, password, google_id) VALUES ('dhairyakandhari18@gmail,com', 'Dhairya', 'Admin', NULL, '104763450408322539199');


