import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { Payslip, PayslipDeduction } from '../../../types';

interface PayslipViewerProps {
  payslip: Payslip;
  coachName: string;
  coachEmail: string;
  onClose: () => void;
  onRefresh: () => void;
  isAdmin?: boolean;
  isMasterAdmin?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const PayslipViewer: React.FC<PayslipViewerProps> = ({
  payslip,
  coachName,
  coachEmail,
  onClose,
  onRefresh,
  isAdmin = false,
  isMasterAdmin = false,
}) => {
  const { user } = useAuth();
  const [nricLast4, setNricLast4] = useState<string | null>(null);
  const [citizenshipStatus, setCitizenshipStatus] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [newDeductionDesc, setNewDeductionDesc] = useState('');
  const [newDeductionAmount, setNewDeductionAmount] = useState('');
  const [editingCPF, setEditingCPF] = useState(false);
  const [cpfAmount, setCpfAmount] = useState(payslip.cpf_contribution.toString());
  const [saving, setSaving] = useState(false);

  // Fetch NRIC, citizenship status, and employee ID from users table
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('nric_last4, citizenship_status, employee_id')
          .eq('id', payslip.user_id)
          .single();

        if (!error && data) {
          setNricLast4(data.nric_last4);
          setCitizenshipStatus(data.citizenship_status);
          setEmployeeId(data.employee_id);
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUserData();
  }, [payslip.user_id]);

  // Check if CPF should be shown (citizens and PR only)
  const showCPF = citizenshipStatus === 'citizen' || citizenshipStatus === 'pr';

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getPaymentDate = () => {
    if (payslip.payment_date) {
      return new Date(payslip.payment_date).toLocaleDateString('en-SG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    return payslip.employment_type === 'full_time'
      ? '1st of month'
      : 'Last Sunday of period';
  };

  const getNRIC = () => {
    if (!nricLast4) return 'Not provided';
    return `XXX${nricLast4}`;
  };

  // Calculate employer CPF contribution (17% for Singapore citizens/PR)
  const employerCPF = Math.round(payslip.gross_pay * 0.17 * 100) / 100;
  const startDate = `01 ${MONTH_NAMES[payslip.month - 1].substring(0, 3)} ${payslip.year}`;
  const endDate = `${new Date(payslip.year, payslip.month, 0).getDate()} ${MONTH_NAMES[payslip.month - 1].substring(0, 3)} ${payslip.year}`;

  const handleStatusToggle = async () => {
    try {
      const newStatus = payslip.status === 'paid' ? 'pending' : 'paid';
      const { error } = await supabase
        .from('payslips')
        .update({
          status: newStatus,
          payment_date: newStatus === 'paid' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payslip.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    }
  };

  const handleUpdateCPF = async () => {
    setSaving(true);
    try {
      const cpf = parseFloat(cpfAmount) || 0;
      const totalDeductions = cpf + payslip.other_deductions;

      const { error } = await supabase
        .from('payslips')
        .update({
          cpf_contribution: cpf,
          total_deductions: totalDeductions,
          net_pay: payslip.gross_pay - totalDeductions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payslip.id);

      if (error) throw error;
      setEditingCPF(false);
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update CPF');
    } finally {
      setSaving(false);
    }
  };

  const handleAddDeduction = async () => {
    if (!newDeductionDesc.trim() || !newDeductionAmount.trim()) {
      Alert.alert('Error', 'Please enter description and amount');
      return;
    }

    const amount = parseFloat(newDeductionAmount);
    if (amount <= 0) {
      Alert.alert('Error', 'Amount must be greater than 0');
      return;
    }

    setSaving(true);
    try {
      const newDeduction: PayslipDeduction = {
        id: crypto.randomUUID(),
        description: newDeductionDesc,
        amount: amount,
      };

      const updatedDeductions = [...(payslip.deduction_details || []), newDeduction];
      const newOtherDeductions = payslip.other_deductions + amount;
      const totalDeductions = payslip.cpf_contribution + newOtherDeductions;

      const { error } = await supabase
        .from('payslips')
        .update({
          other_deductions: newOtherDeductions,
          deduction_details: updatedDeductions,
          total_deductions: totalDeductions,
          net_pay: payslip.gross_pay - totalDeductions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payslip.id);

      if (error) throw error;

      setShowDeductionModal(false);
      setNewDeductionDesc('');
      setNewDeductionAmount('');
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add deduction');
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = async () => {
    const employerCPFVal = showCPF ? Math.round(payslip.gross_pay * 0.17 * 100) / 100 : 0;
    const totalCPFVal = showCPF ? payslip.cpf_contribution + employerCPFVal : 0;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Courier New', monospace; margin: 40px; color: #333; font-size: 12px; }
          .border-top { border-top: 3px double #333; padding-top: 15px; }
          .border-bottom { border-bottom: 3px double #333; padding-bottom: 15px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h2 { margin: 0 0 4px 0; font-size: 16px; }
          .header .company { font-size: 14px; color: #555; margin: 0; }
          .info-section { margin-bottom: 15px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .employee-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          .employee-name { font-weight: bold; font-size: 13px; }
          .employee-role { color: #666; font-style: italic; }
          .section-header { display: flex; justify-content: space-between; font-weight: bold; margin-top: 18px; margin-bottom: 4px; font-size: 12px; }
          .divider { border-top: 1px solid #999; margin: 4px 0 8px 0; }
          .line-item { display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 0; }
          .line-item.indent { padding-left: 15px; font-size: 11px; color: #555; }
          .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px; padding-top: 6px; border-top: 1px solid #ccc; }
          .net-salary { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 15px 0; padding: 10px; background-color: #f0f0f0; border: 1px solid #999; }
          .footer { margin-top: 25px; font-size: 10px; color: #777; }
          .footer p { margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="border-top border-bottom">
          <div class="header">
            <h2>Itemised Payslips</h2>
            <p class="company">Jai Muay Thai</p>
          </div>
        </div>

        <div class="info-section" style="margin-top: 15px;">
          <div class="info-row"><span>Pay Date:</span><span>${endDate}</span></div>
          <div class="info-row"><span>Pay period from:</span><span>${startDate}</span></div>
          <div class="info-row"><span>Pay period to:</span><span>${endDate}</span></div>
        </div>

        <div class="info-section">
          <div class="employee-row">
            <span class="employee-name">${coachName}</span>
            <span>Employee ID: ${employeeId || 'N/A'}</span>
          </div>
          <div>${getNRIC()}</div>
          <div class="employee-role">Trainer</div>
        </div>

        <div class="section-header">
          <span>Earnings (A)</span>
          <span>Payments (B)</span>
        </div>
        <div class="divider"></div>
        <div class="line-item"><span>Basic Pay</span><span>${formatCurrency(payslip.base_salary)}</span></div>
        <div class="line-item indent"><span>Basic Pay (${startDate} - ${endDate})</span><span>${formatCurrency(payslip.base_salary)}</span></div>
        <div class="line-item"><span>Allowances(TOTAL)</span><span>${formatCurrency(0)}</span></div>
        <div class="total-row"><span>Total Earnings</span><span>${formatCurrency(payslip.base_salary)}</span></div>

        <div class="section-header"><span>Deductions (C)</span><span></span></div>
        <div class="divider"></div>
        <div class="line-item"><span>Deductions(TOTAL)</span><span>${formatCurrency(payslip.other_deductions)}</span></div>
        <div class="line-item"><span>Self-Help Group</span><span>${formatCurrency(0)}</span></div>
        <div class="line-item"><span>CPF (Employee)</span><span>${formatCurrency(payslip.cpf_contribution)}</span></div>
        <div class="total-row"><span>Total Deductions</span><span>${formatCurrency(payslip.total_deductions)}</span></div>

        <div class="net-salary"><span>Net Salary (A+B-C)</span><span>${formatCurrency(payslip.base_salary - payslip.total_deductions)}</span></div>

        <div class="section-header"><span>Other Additional Payments(TOTAL)</span><span></span></div>
        <div class="divider"></div>
        <div class="line-item"><span>Others (PT Commissions)</span><span>${formatCurrency(payslip.pt_commission)}</span></div>
        <div class="total-row"><span>Total Payments</span><span>${formatCurrency(payslip.pt_commission)}</span></div>

        <div class="section-header"><span>Statutory Funds</span><span></span></div>
        <div class="divider"></div>
        <div class="line-item"><span>CPF (Employee)</span><span>${formatCurrency(payslip.cpf_contribution)}</span></div>
        <div class="line-item"><span>CPF (Employer)</span><span>${formatCurrency(employerCPFVal)}</span></div>
        <div class="total-row"><span>Total CPF</span><span>${formatCurrency(totalCPFVal)}</span></div>

        <div class="footer">
          <p>*Paid by bank transfer</p>
          <p>This is a computer generated payslip; no signature is required.</p>
        </div>

        <div style="border-top: 3px double #333; margin-top: 20px;"></div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const filename = `Payslip_${coachName.replace(/\s+/g, '_')}_${MONTH_NAMES[payslip.month - 1]}_${payslip.year}.pdf`;
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: filename });
    } catch (err) {
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    }
  };

  const handleEmailPayslip = async () => {
    if (!coachEmail) {
      Alert.alert('Error', 'No email address found for this account');
      return;
    }

    // Use same Talenox format as the main PDF
    const emailEmployerCPF = showCPF ? Math.round(payslip.gross_pay * 0.17 * 100) / 100 : 0;
    const emailTotalCPF = showCPF ? payslip.cpf_contribution + emailEmployerCPF : 0;

    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Courier New', monospace; margin: 40px; color: #333; font-size: 12px; }
          .border-top { border-top: 3px double #333; padding-top: 15px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h2 { margin: 0 0 4px 0; font-size: 16px; }
          .header .company { font-size: 14px; color: #555; margin: 0; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .employee-name { font-weight: bold; font-size: 13px; }
          .section-header { font-weight: bold; margin-top: 18px; margin-bottom: 4px; }
          .divider { border-top: 1px solid #999; margin: 4px 0 8px 0; }
          .line-item { display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 0; }
          .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px; padding-top: 6px; border-top: 1px solid #ccc; }
          .net-salary { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 15px 0; padding: 10px; background-color: #f0f0f0; border: 1px solid #999; }
          .footer { margin-top: 25px; font-size: 10px; color: #777; }
          .footer p { margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="border-top">
          <div class="header">
            <h2>Itemised Payslips</h2>
            <p class="company">Jai Muay Thai</p>
          </div>
        </div>
        <div class="info-row"><span>Pay Date:</span><span>${endDate}</span></div>
        <div class="info-row"><span>Pay period from:</span><span>${startDate}</span></div>
        <div class="info-row"><span>Pay period to:</span><span>${endDate}</span></div>
        <br>
        <div class="info-row"><span class="employee-name">${coachName}</span><span>Employee ID: ${employeeId || 'N/A'}</span></div>
        <div>${getNRIC()}</div>
        <div style="color:#666;font-style:italic;">Trainer</div>
        <br>
        <div class="section-header">Earnings (A)</div>
        <div class="divider"></div>
        <div class="line-item"><span>Basic Pay</span><span>${formatCurrency(payslip.base_salary)}</span></div>
        <div class="line-item"><span>Allowances(TOTAL)</span><span>${formatCurrency(0)}</span></div>
        <div class="total-row"><span>Total Earnings</span><span>${formatCurrency(payslip.base_salary)}</span></div>

        <div class="section-header">Deductions (C)</div>
        <div class="divider"></div>
        <div class="line-item"><span>CPF (Employee)</span><span>${formatCurrency(payslip.cpf_contribution)}</span></div>
        <div class="total-row"><span>Total Deductions</span><span>${formatCurrency(payslip.total_deductions)}</span></div>

        <div class="net-salary"><span>Net Salary (A+B-C)</span><span>${formatCurrency(payslip.base_salary - payslip.total_deductions)}</span></div>

        <div class="section-header">Other Additional Payments(TOTAL)</div>
        <div class="divider"></div>
        <div class="line-item"><span>Others (PT Commissions)</span><span>${formatCurrency(payslip.pt_commission)}</span></div>
        <div class="total-row"><span>Total Payments</span><span>${formatCurrency(payslip.pt_commission)}</span></div>

        <div class="section-header">Statutory Funds</div>
        <div class="divider"></div>
        <div class="line-item"><span>CPF (Employee)</span><span>${formatCurrency(payslip.cpf_contribution)}</span></div>
        <div class="line-item"><span>CPF (Employer)</span><span>${formatCurrency(emailEmployerCPF)}</span></div>
        <div class="total-row"><span>Total CPF</span><span>${formatCurrency(emailTotalCPF)}</span></div>

        <div class="footer">
          <p>*Paid by bank transfer</p>
          <p>This is a computer generated payslip; no signature is required.</p>
        </div>
        <div style="border-top: 3px double #333; margin-top: 20px;"></div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: pdfHtml });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Payslip - ${coachEmail}`,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to prepare email. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payslip</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Talenox Header */}
          <View style={styles.talenoxHeader}>
            <Text style={styles.talenoxTitle}>Itemised Payslips</Text>
            <Text style={styles.talenoxCompany}>Jai Muay Thai</Text>
          </View>

          {/* Pay Date & Period */}
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pay Date</Text>
              <Text style={styles.infoValue}>{endDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pay period from</Text>
              <Text style={styles.infoValue}>{startDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pay period to</Text>
              <Text style={styles.infoValue}>{endDate}</Text>
            </View>
          </View>

          {/* Employee Info */}
          <View style={styles.section}>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeName}>{coachName}</Text>
              <Text style={styles.employeeIdText}>Employee ID: {employeeId || 'N/A'}</Text>
            </View>
            <Text style={styles.employeeNric}>{getNRIC()}</Text>
            <Text style={styles.employeeRole}>Trainer</Text>
          </View>

          {/* Earnings (A) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Earnings (A)</Text>
            </View>
            <View style={styles.talenoxDivider} />

            <View style={styles.momEarningsRow}>
              <Text style={styles.momEarningsLabel}>Basic Pay</Text>
              <Text style={styles.momEarningsValue}>{formatCurrency(payslip.base_salary)}</Text>
            </View>
            <View style={styles.momEarningsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.momEarningsLabel}>Basic Pay ({startDate}</Text>
                <Text style={styles.momEarningsLabel}> - {endDate})</Text>
              </View>
              <Text style={styles.momEarningsValue}>{formatCurrency(payslip.base_salary)}</Text>
            </View>
            <View style={styles.momEarningsRow}>
              <Text style={styles.momEarningsLabel}>Allowances(TOTAL)</Text>
              <Text style={styles.momEarningsValue}>{formatCurrency(0)}</Text>
            </View>

            <View style={styles.grossSalaryRow}>
              <Text style={styles.grossSalaryLabel}>Total Earnings</Text>
              <Text style={styles.grossSalaryValue}>{formatCurrency(payslip.base_salary)}</Text>
            </View>
          </View>

          {/* Deductions (C) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Deductions (C)</Text>
            </View>
            <View style={styles.talenoxDivider} />

            <View style={styles.momDeductionRow}>
              <Text style={styles.momDeductionLabel}>Deductions(TOTAL)</Text>
              <Text style={styles.momDeductionValue}>{formatCurrency(payslip.other_deductions)}</Text>
            </View>
            <View style={styles.momDeductionRow}>
              <Text style={styles.momDeductionLabel}>Self-Help Group</Text>
              <Text style={styles.momDeductionValue}>{formatCurrency(0)}</Text>
            </View>
            <View style={styles.momDeductionRow}>
              <Text style={styles.momDeductionLabel}>CPF (Employee)</Text>
              <Text style={styles.momDeductionValue}>{formatCurrency(payslip.cpf_contribution)}</Text>
            </View>

            {(payslip.deduction_details || []).map((deduction, index) => (
              <View key={deduction.id || index} style={styles.momDeductionRow}>
                <Text style={styles.momDeductionLabel}>{deduction.description}</Text>
                <Text style={[styles.momDeductionValue, { color: Colors.error }]}>
                  {formatCurrency(deduction.amount)}
                </Text>
              </View>
            ))}

            {isMasterAdmin && (
              <TouchableOpacity
                style={styles.addDeductionButton}
                onPress={() => setShowDeductionModal(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color={Colors.jaiBlue} />
                <Text style={styles.addDeductionText}>Add Deduction</Text>
              </TouchableOpacity>
            )}

            <View style={styles.momTotalDeductionsRow}>
              <Text style={styles.momTotalDeductionsLabel}>Total Deductions</Text>
              <Text style={styles.momTotalDeductionsValue}>{formatCurrency(payslip.total_deductions)}</Text>
            </View>
          </View>

          {/* Net Salary */}
          <View style={styles.netSalaryCard}>
            <Text style={styles.netSalaryLabel}>Net Salary (A+B-C)</Text>
            <Text style={styles.netSalaryValue}>{formatCurrency(payslip.base_salary - payslip.total_deductions)}</Text>
          </View>

          {/* Other Additional Payments */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
              <Text style={styles.sectionTitle}>Other Additional Payments(TOTAL)</Text>
            </View>
            <View style={styles.talenoxDivider} />

            <View style={styles.momEarningsRow}>
              <Text style={styles.momEarningsLabel}>Others (PT Commissions)</Text>
              <Text style={[styles.momEarningsValue, { color: Colors.success }]}>{formatCurrency(payslip.pt_commission)}</Text>
            </View>

            <View style={styles.grossSalaryRow}>
              <Text style={styles.grossSalaryLabel}>Total Payments</Text>
              <Text style={[styles.grossSalaryValue, { color: Colors.success }]}>{formatCurrency(payslip.pt_commission)}</Text>
            </View>
          </View>

          {/* Statutory Funds */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: Colors.warning }]} />
              <Text style={styles.sectionTitle}>Statutory Funds</Text>
            </View>
            <View style={styles.talenoxDivider} />

            <View style={styles.momEarningsRow}>
              <Text style={styles.momEarningsLabel}>CPF (Employee)</Text>
              <Text style={styles.momEarningsValue}>{formatCurrency(payslip.cpf_contribution)}</Text>
            </View>
            <View style={styles.momEarningsRow}>
              <Text style={styles.momEarningsLabel}>CPF (Employer)</Text>
              <Text style={styles.momEarningsValue}>{formatCurrency(showCPF ? employerCPF : 0)}</Text>
            </View>

            <View style={styles.grossSalaryRow}>
              <Text style={styles.grossSalaryLabel}>Total CPF</Text>
              <Text style={styles.grossSalaryValue}>{formatCurrency(showCPF ? payslip.cpf_contribution + employerCPF : 0)}</Text>
            </View>
          </View>

          {/* Grand Total Net */}
          <View style={[styles.netSalaryCard, { borderColor: Colors.success, backgroundColor: Colors.success + '15' }]}>
            <Text style={styles.netSalaryLabel}>TOTAL NET PAY</Text>
            <Text style={[styles.netSalaryValue, { color: Colors.success }]}>{formatCurrency(payslip.net_pay)}</Text>
          </View>

          {/* Status & Actions */}
          <View style={styles.statusSection}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: payslip.status === 'paid' ? Colors.success + '20' : Colors.warning + '20' }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: payslip.status === 'paid' ? Colors.success : Colors.warning }
                ]}>
                  {payslip.status === 'paid' ? 'PAID' : 'PENDING'}
                </Text>
              </View>
            </View>

            {isAdmin && (
              <TouchableOpacity
                style={styles.statusToggleButton}
                onPress={handleStatusToggle}
              >
                <Text style={styles.statusToggleText}>
                  Mark as {payslip.status === 'paid' ? 'Pending' : 'Paid'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={generatePDF}>
              <Ionicons name="document-outline" size={20} color={Colors.jaiBlue} />
              <Text style={styles.actionButtonText}>Download PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleEmailPayslip}>
              <Ionicons name="mail-outline" size={20} color={Colors.jaiBlue} />
              <Text style={styles.actionButtonText}>Email to Me</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>*Paid by bank transfer</Text>
            <Text style={styles.footerText}>
              This is a computer generated payslip; no signature is required.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Add Deduction Modal */}
      <Modal visible={showDeductionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Deduction</Text>

            <Text style={styles.modalLabel}>Description</Text>
            <View style={styles.modalInputContainer}>
              <TextInput
                style={styles.modalInput}
                value={newDeductionDesc}
                onChangeText={setNewDeductionDesc}
                placeholder="e.g., Advance payment, Insurance"
                placeholderTextColor={Colors.darkGray}
              />
            </View>

            <Text style={styles.modalLabel}>Amount (S$)</Text>
            <View style={styles.modalInputContainer}>
              <Text style={styles.currencyPrefix}>S$</Text>
              <TextInput
                style={styles.modalInput}
                value={newDeductionAmount}
                onChangeText={setNewDeductionAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.darkGray}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeductionModal(false);
                  setNewDeductionDesc('');
                  setNewDeductionAmount('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleAddDeduction}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Adding...' : 'Add Deduction'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  // Talenox header styles
  talenoxHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderTopColor: Colors.lightGray,
    borderBottomColor: Colors.lightGray,
    marginBottom: Spacing.md,
  },
  talenoxTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 4,
  },
  talenoxCompany: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  talenoxDivider: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginBottom: 8,
  },
  employeeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  employeeIdText: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  employeeNric: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 2,
  },
  employeeRole: {
    fontSize: 13,
    color: Colors.darkGray,
    fontStyle: 'italic',
  },
  companyHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.jaiBlue,
    marginBottom: Spacing.md,
  },
  companyName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.jaiBlue,
  },
  companyUEN: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 4,
  },
  companyAddress: {
    fontSize: 10,
    color: Colors.darkGray,
    marginTop: 2,
  },
  companyContact: {
    fontSize: 10,
    color: Colors.darkGray,
    marginTop: 4,
  },
  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  earningsLabel: {
    fontSize: 14,
    color: Colors.white,
    flex: 1,
  },
  earningsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  subLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    marginLeft: 8,
    marginBottom: 4,
  },
  grossPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  grossPayLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  grossPayValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  noDeductions: {
    fontSize: 13,
    color: Colors.darkGray,
    fontStyle: 'italic',
  },
  totalDeductionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalDeductionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
  totalDeductionsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
  netPayCard: {
    backgroundColor: Colors.jaiBlue + '20',
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
    marginBottom: Spacing.md,
  },
  netPayLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.lightGray,
    letterSpacing: 1,
  },
  netPayValue: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.jaiBlue,
    marginTop: 4,
  },
  statusSection: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusToggleButton: {
    marginTop: Spacing.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statusToggleText: {
    fontSize: 13,
    color: Colors.jaiBlue,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  footerText: {
    fontSize: 10,
    color: Colors.darkGray,
    textAlign: 'center',
    lineHeight: 16,
  },
  editCpfButton: {
    marginTop: 4,
  },
  editCpfText: {
    fontSize: 11,
    color: Colors.jaiBlue,
  },
  cpfEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cpfInput: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: Colors.white,
    width: 80,
    fontSize: 14,
  },
  saveCpfButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 8,
  },
  saveCpfText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  addDeductionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 8,
  },
  addDeductionText: {
    fontSize: 13,
    color: Colors.jaiBlue,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  modalInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.white,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.lg,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    color: Colors.darkGray,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: Colors.jaiBlue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  // Weekly PT Breakdown styles
  weeklyBreakdown: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginLeft: 20,
  },
  weeklyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 10,
  },
  weeklyLabel: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  weeklyValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  weeklyDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
    marginLeft: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  weeklyTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    marginLeft: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderStyle: 'dashed',
  },
  weeklyTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
  },
  weeklyTotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.jaiBlue,
  },

  // MOM-Compliant Payslip Styles
  momCompanyHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: Colors.jaiBlue,
    marginBottom: Spacing.md,
  },
  momCompanyName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.jaiBlue,
    textAlign: 'center',
  },
  momCompanyUEN: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 4,
  },
  momCompanyAddress: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
    textAlign: 'center',
  },
  momNotice: {
    backgroundColor: Colors.jaiBlue + '15',
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  momNoticeText: {
    fontSize: 11,
    color: Colors.jaiBlue,
    fontWeight: '600',
    textAlign: 'center',
  },
  salaryPeriodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  salaryPeriodItem: {
    flex: 1,
    alignItems: 'center',
  },
  salaryPeriodLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    marginBottom: 4,
  },
  salaryPeriodValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  paymentDetailsBox: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FFB300',
    borderRadius: 8,
    padding: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  paymentLabel: {
    fontSize: 13,
    color: '#666',
  },
  paymentValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  momEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  bonusEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  momEarningsLabel: {
    fontSize: 14,
    color: Colors.white,
  },
  momEarningsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  ptSection: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  ptSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
  },
  ptWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingLeft: 12,
  },
  ptWeekLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  ptWeekValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  ptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    marginLeft: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderStyle: 'dashed',
  },
  ptTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
  },
  ptTotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.jaiBlue,
  },
  grossSalaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.jaiBlue,
    backgroundColor: Colors.jaiBlue + '15',
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  grossSalaryLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  grossSalaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.jaiBlue,
  },
  momDeductionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  momDeductionLabel: {
    fontSize: 14,
    color: Colors.white,
  },
  momDeductionValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  momTotalDeductionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  momTotalDeductionsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.lightGray,
  },
  momTotalDeductionsValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  netSalaryCard: {
    backgroundColor: Colors.jaiBlue + '20',
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.jaiBlue,
    marginBottom: Spacing.md,
  },
  netSalaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    letterSpacing: 1,
  },
  netSalaryValue: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.jaiBlue,
    marginTop: 4,
  },
  employerSection: {
    backgroundColor: Colors.success + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  employerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  employerSectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: Colors.success,
    borderRadius: 2,
    marginRight: 8,
  },
  employerSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  employerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  employerLabel: {
    fontSize: 14,
    color: Colors.white,
  },
  employerValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
