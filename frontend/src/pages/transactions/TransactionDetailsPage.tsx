import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const TransactionDetailsPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Transaction Details - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Transaction Details
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>Transaction details page - coming soon</Typography>
        </Paper>
      </Box>
    </>
  );
};

export default TransactionDetailsPage;
