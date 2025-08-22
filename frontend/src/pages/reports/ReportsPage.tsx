import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const ReportsPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Reports & SAR - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Reports & Suspicious Activity Reports
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Generate compliance reports and manage SAR submissions
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>
            Reports and SAR interface will be implemented here, including:
          </Typography>
          <ul>
            <li>SAR creation and submission workflow</li>
            <li>Compliance reporting tools</li>
            <li>Analytics and trend reports</li>
            <li>Export capabilities (PDF, Excel, CSV)</li>
            <li>Automated report scheduling</li>
          </ul>
        </Paper>
      </Box>
    </>
  );
};

export default ReportsPage;
