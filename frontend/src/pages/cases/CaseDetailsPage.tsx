import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const CaseDetailsPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Case Details - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Case Details
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>Case details page - coming soon</Typography>
        </Paper>
      </Box>
    </>
  );
};

export default CaseDetailsPage;
