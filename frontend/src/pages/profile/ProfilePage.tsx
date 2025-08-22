import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const ProfilePage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Profile - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          User Profile
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Manage your profile settings and preferences
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>
            User profile interface will be implemented here, including:
          </Typography>
          <ul>
            <li>Personal information management</li>
            <li>Password change functionality</li>
            <li>Notification preferences</li>
            <li>Activity history</li>
            <li>Account security settings</li>
          </ul>
        </Paper>
      </Box>
    </>
  );
};

export default ProfilePage;
