import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const CasesPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Cases - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Case Management
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Manage fraud investigation cases and workflows
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>
            Case management interface will be implemented here, including:
          </Typography>
          <ul>
            <li>Case creation and assignment</li>
            <li>Case status tracking and workflow</li>
            <li>Evidence collection and documentation</li>
            <li>Case collaboration tools</li>
            <li>Case resolution and reporting</li>
          </ul>
        </Paper>
      </Box>
    </>
  );
};

export default CasesPage;
