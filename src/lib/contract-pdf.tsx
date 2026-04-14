// @react-pdf template mirroring the paper Jai Muay Thai PT contract verbatim.
// Renders server-side via renderToBuffer() in the createSignedContract action.
/* eslint-disable jsx-a11y/alt-text */

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111",
  },
  header: {
    alignItems: "center",
    marginBottom: 12,
  },
  orgName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
  },
  regNo: {
    fontSize: 10,
    marginTop: 2,
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    marginBottom: 12,
  },
  introRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
  },
  fieldLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    minWidth: 200,
    paddingBottom: 1,
    marginHorizontal: 4,
  },
  fieldLineShort: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    minWidth: 80,
    paddingBottom: 1,
    marginHorizontal: 4,
  },
  fieldCaption: {
    fontSize: 8,
    color: "#555",
    marginTop: 1,
  },
  introCaptionRow: {
    flexDirection: "row",
    marginBottom: 10,
    paddingHorizontal: 0,
  },
  introCaptionGroup: {
    marginRight: 24,
  },
  body: {
    marginBottom: 12,
    lineHeight: 1.4,
  },
  servicesHeading: {
    textAlign: "center",
    backgroundColor: "#d9d9d9",
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: "#000",
    marginBottom: 14,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000",
  },
  tableRowFirst: {
    flexDirection: "row",
  },
  tableCellLabel: {
    width: "30%",
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#000",
    fontFamily: "Helvetica-Bold",
  },
  tableCellValue: {
    width: "20%",
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#000",
  },
  tableCellLabel2: {
    width: "25%",
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#000",
    fontFamily: "Helvetica-Bold",
  },
  tableCellValue2: {
    width: "25%",
    padding: 6,
  },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  clause: {
    flexDirection: "row",
    marginBottom: 6,
  },
  clauseNum: {
    width: 18,
  },
  clauseText: {
    flex: 1,
    lineHeight: 1.4,
  },
  sigBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  sigBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#000",
    padding: 8,
    minHeight: 140,
  },
  sigBoxTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  sigLineRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  sigLineLabel: {
    width: 60,
  },
  sigLineValue: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 1,
    minHeight: 12,
  },
  sigImage: {
    height: 70,
    objectFit: "contain",
  },
  nricNote: {
    fontSize: 8,
    color: "#666",
    marginTop: 2,
  },
});

const TC_CLAUSES = [
  "All payments made are non-refundable. In the case where the Client is unable to continue training due to medical reasons or re-location abroad, we will consider grounds for refund should supporting documentation be furnished.",
  "Please book your sessions with your coach at least 24 hours prior to your intended time of training. If you need to cancel or postpone any training session, you should give your coach at least 24 hours advance notice. If you do not give sufficient notice or turn up for a session, we may forfeit the session from your package.",
  "After each session, your coach will request that you sign the attendance record. You agree that the attendance record shall be the conclusive record of your utilisation of the package purchased.",
];

const WM_CLAUSES = [
  "You warrant that you are in good physical condition and have no medical conditions which may prevent you from undergoing the personal training sessions for Muay Thai.",
  "If you have any medical condition or history, please inform your trainer prior to the commencement of the session. You acknowledge and accept that our trainers are not qualified medical professionals and are unable to give medical advice and opinions and will not be liable for statements constructed as such. You should consult your own medical professional if you are unsure about any aspect of your health.",
  "In providing you with this personal training service, you voluntarily accept the risk of injury involved in these sessions. Unless our coaches have been negligent, we do not accept liability for any injury or death in connection with the personal training services provided. We do not accept any liability for any other loss or damage unless you are able to prove that our coaches have been truly negligent.",
  "You acknowledge that you have had the opportunity to read this contract and to clarify any doubts with the owner, to your satisfaction. You acknowledge you have understood the terms of this agreement.",
  "You warrant that you have the capacity to enter into this agreement and agree to be bound by it.",
  "This agreement shall be governed by Singapore law and you agree to subject yourself to the exclusive jurisdiction of the courts of Singapore.",
];

export interface ContractPdfData {
  clientName: string;
  clientNricLast4: string | null;
  isKid: boolean;
  kidName: string | null;
  kidAge: number | null;
  guardianName: string | null;
  coachName: string;
  totalSessions: number;
  pricePerSession: number;
  totalPrice: number;
  paymentMethod: string;
  expiryDate: string; // DD/MM/YY or similar display
  clientSignatureDataUrl: string;
  jmtSignatureDataUrl: string;
  jmtRepName: string;
  signedDateDisplay: string;
}

function formatCurrency(n: number): string {
  return `S$${n.toFixed(2)}`;
}

export function ContractPdfDoc({ data }: { data: ContractPdfData }) {
  const signerDisplayName = data.isKid
    ? `${data.guardianName ?? ""}${data.guardianName ? " (Parent/Guardian)" : ""}`
    : data.clientName;

  const intro = data.isKid
    ? `${data.guardianName ?? "Guardian"} as parent/guardian of ${data.kidName ?? "Minor"}${data.kidAge != null ? ` (age ${data.kidAge})` : ""}`
    : data.clientName;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>JAI MUAY THAI</Text>
          <Text style={styles.regNo}>(REG: 202239849D)</Text>
          <Text style={styles.title}>PERSONAL TRAINING AGREEMENT</Text>
        </View>

        <View style={styles.introRow}>
          <Text>I, </Text>
          <View style={styles.fieldLine}>
            <Text>{intro}</Text>
          </View>
          <View style={styles.fieldLineShort}>
            <Text>{data.clientNricLast4 ? `****${data.clientNricLast4}` : ""}</Text>
          </View>
          <Text>(hereinafter &quot;Client&quot;)</Text>
        </View>
        <View style={styles.introCaptionRow}>
          <View style={styles.introCaptionGroup}>
            <Text style={styles.fieldCaption}>(Name of Client)</Text>
          </View>
          <View style={styles.introCaptionGroup}>
            <Text style={styles.fieldCaption}>(NRIC / Passport No. — last 4)</Text>
          </View>
        </View>

        <Text style={styles.body}>
          agree to enter into this service contract with Jai Muay Thai (Reg No: 202239849D) and
          accept the terms of this contact.
        </Text>

        <View style={styles.table}>
          <Text style={styles.servicesHeading}>PERSONAL TRAINING (PT) SERVICES</Text>
          <View style={styles.tableRow}>
            <View style={styles.tableCellLabel}><Text>Coach/Trainer:</Text></View>
            <View style={styles.tableCellValue}><Text>{data.coachName}</Text></View>
            <View style={styles.tableCellLabel2}><Text>No. of PT Sessions:</Text></View>
            <View style={styles.tableCellValue2}><Text>{data.totalSessions}</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCellLabel}><Text>Expiry of Package:</Text></View>
            <View style={styles.tableCellValue}><Text>{data.expiryDate}</Text></View>
            <View style={styles.tableCellLabel2}><Text>Price Per Session:</Text></View>
            <View style={styles.tableCellValue2}><Text>{formatCurrency(data.pricePerSession)}</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCellLabel}><Text> </Text></View>
            <View style={styles.tableCellValue}><Text> </Text></View>
            <View style={styles.tableCellLabel2}><Text>Total Payment:</Text></View>
            <View style={styles.tableCellValue2}><Text>{formatCurrency(data.totalPrice)}</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCellLabel}><Text> </Text></View>
            <View style={styles.tableCellValue}><Text> </Text></View>
            <View style={styles.tableCellLabel2}><Text>Payment via:</Text></View>
            <View style={styles.tableCellValue2}><Text>{data.paymentMethod}</Text></View>
          </View>
        </View>

        <Text style={styles.sectionHeading}>TERMS &amp; CONDITIONS</Text>
        {TC_CLAUSES.map((c, i) => (
          <View key={i} style={styles.clause}>
            <Text style={styles.clauseNum}>{i + 1}.</Text>
            <Text style={styles.clauseText}>{c}</Text>
          </View>
        ))}

        <Text style={styles.sectionHeading}>WARRANTIES &amp; MISCELLANEOUS</Text>
        {WM_CLAUSES.map((c, i) => (
          <View key={i} style={styles.clause}>
            <Text style={styles.clauseNum}>{i + 1}.</Text>
            <Text style={styles.clauseText}>{c}</Text>
          </View>
        ))}

        <Text style={styles.sectionHeading}>Agreement between the Parties</Text>
        <View style={styles.sigBlock}>
          <View style={styles.sigBox}>
            <Text style={styles.sigBoxTitle}>Client</Text>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Name:</Text>
              <View style={styles.sigLineValue}><Text>{signerDisplayName}</Text></View>
            </View>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Date:</Text>
              <View style={styles.sigLineValue}><Text>{data.signedDateDisplay}</Text></View>
            </View>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Signature:</Text>
              <View style={styles.sigLineValue}>
                <Image src={data.clientSignatureDataUrl} style={styles.sigImage} />
              </View>
            </View>
          </View>

          <View style={styles.sigBox}>
            <Text style={styles.sigBoxTitle}>For and behalf of Jai Muay Thai</Text>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Name:</Text>
              <View style={styles.sigLineValue}><Text>{data.jmtRepName}</Text></View>
            </View>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Date:</Text>
              <View style={styles.sigLineValue}><Text>{data.signedDateDisplay}</Text></View>
            </View>
            <View style={styles.sigLineRow}>
              <Text style={styles.sigLineLabel}>Signature:</Text>
              <View style={styles.sigLineValue}>
                <Image src={data.jmtSignatureDataUrl} style={styles.sigImage} />
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
