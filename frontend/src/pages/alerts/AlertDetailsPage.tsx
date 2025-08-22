import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const AlertDetailsPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Alert Details - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Alert Details
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>Alert details page - coming soon</Typography>
        </Paper>
      </Box>
    </>
  );
};

export default AlertDetailsPage;
