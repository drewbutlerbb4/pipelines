// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Code generated by protoc-gen-go. DO NOT EDIT.
// source: backend/api/error.proto

package go_client // import "github.com/kubeflow/pipelines/backend/api/go_client"

import proto "github.com/golang/protobuf/proto"
import fmt "fmt"
import math "math"
import any "github.com/golang/protobuf/ptypes/any"

// Reference imports to suppress errors if they are not otherwise used.
var _ = proto.Marshal
var _ = fmt.Errorf
var _ = math.Inf

// This is a compile-time assertion to ensure that this generated file
// is compatible with the proto package it is being compiled against.
// A compilation error at this line likely means your copy of the
// proto package needs to be updated.
const _ = proto.ProtoPackageIsVersion2 // please upgrade the proto package

type Error struct {
	ErrorMessage         string   `protobuf:"bytes,1,opt,name=error_message,json=errorMessage,proto3" json:"error_message,omitempty"`
	ErrorDetails         string   `protobuf:"bytes,2,opt,name=error_details,json=errorDetails,proto3" json:"error_details,omitempty"`
	XXX_NoUnkeyedLiteral struct{} `json:"-"`
	XXX_unrecognized     []byte   `json:"-"`
	XXX_sizecache        int32    `json:"-"`
}

func (m *Error) Reset()         { *m = Error{} }
func (m *Error) String() string { return proto.CompactTextString(m) }
func (*Error) ProtoMessage()    {}
func (*Error) Descriptor() ([]byte, []int) {
	return fileDescriptor_error_c958bf85e2691313, []int{0}
}
func (m *Error) XXX_Unmarshal(b []byte) error {
	return xxx_messageInfo_Error.Unmarshal(m, b)
}
func (m *Error) XXX_Marshal(b []byte, deterministic bool) ([]byte, error) {
	return xxx_messageInfo_Error.Marshal(b, m, deterministic)
}
func (dst *Error) XXX_Merge(src proto.Message) {
	xxx_messageInfo_Error.Merge(dst, src)
}
func (m *Error) XXX_Size() int {
	return xxx_messageInfo_Error.Size(m)
}
func (m *Error) XXX_DiscardUnknown() {
	xxx_messageInfo_Error.DiscardUnknown(m)
}

var xxx_messageInfo_Error proto.InternalMessageInfo

func (m *Error) GetErrorMessage() string {
	if m != nil {
		return m.ErrorMessage
	}
	return ""
}

func (m *Error) GetErrorDetails() string {
	if m != nil {
		return m.ErrorDetails
	}
	return ""
}

type Status struct {
	Error                string     `protobuf:"bytes,1,opt,name=error,proto3" json:"error,omitempty"`
	Code                 int32      `protobuf:"varint,2,opt,name=code,proto3" json:"code,omitempty"`
	Details              []*any.Any `protobuf:"bytes,3,rep,name=details,proto3" json:"details,omitempty"`
	XXX_NoUnkeyedLiteral struct{}   `json:"-"`
	XXX_unrecognized     []byte     `json:"-"`
	XXX_sizecache        int32      `json:"-"`
}

func (m *Status) Reset()         { *m = Status{} }
func (m *Status) String() string { return proto.CompactTextString(m) }
func (*Status) ProtoMessage()    {}
func (*Status) Descriptor() ([]byte, []int) {
	return fileDescriptor_error_c958bf85e2691313, []int{1}
}
func (m *Status) XXX_Unmarshal(b []byte) error {
	return xxx_messageInfo_Status.Unmarshal(m, b)
}
func (m *Status) XXX_Marshal(b []byte, deterministic bool) ([]byte, error) {
	return xxx_messageInfo_Status.Marshal(b, m, deterministic)
}
func (dst *Status) XXX_Merge(src proto.Message) {
	xxx_messageInfo_Status.Merge(dst, src)
}
func (m *Status) XXX_Size() int {
	return xxx_messageInfo_Status.Size(m)
}
func (m *Status) XXX_DiscardUnknown() {
	xxx_messageInfo_Status.DiscardUnknown(m)
}

var xxx_messageInfo_Status proto.InternalMessageInfo

func (m *Status) GetError() string {
	if m != nil {
		return m.Error
	}
	return ""
}

func (m *Status) GetCode() int32 {
	if m != nil {
		return m.Code
	}
	return 0
}

func (m *Status) GetDetails() []*any.Any {
	if m != nil {
		return m.Details
	}
	return nil
}

func init() {
	proto.RegisterType((*Error)(nil), "api.Error")
	proto.RegisterType((*Status)(nil), "api.Status")
}

func init() { proto.RegisterFile("backend/api/error.proto", fileDescriptor_error_c958bf85e2691313) }

var fileDescriptor_error_c958bf85e2691313 = []byte{
	// 228 bytes of a gzipped FileDescriptorProto
	0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0x4c, 0x90, 0x4d, 0x4b, 0x03, 0x31,
	0x10, 0x86, 0xa9, 0xeb, 0x56, 0x8c, 0x7a, 0x09, 0x05, 0xab, 0xa7, 0x52, 0x2f, 0x3d, 0x25, 0x60,
	0xf1, 0x07, 0x28, 0x7a, 0xf4, 0xe0, 0x7a, 0xf3, 0x52, 0x92, 0xec, 0x34, 0x86, 0xa6, 0x99, 0x90,
	0x0f, 0x64, 0xff, 0xbd, 0x98, 0xb8, 0x74, 0x6f, 0xc9, 0x33, 0xcf, 0xbc, 0xbc, 0x0c, 0xb9, 0x95,
	0x42, 0x1d, 0xc0, 0xf5, 0x5c, 0x78, 0xc3, 0x21, 0x04, 0x0c, 0xcc, 0x07, 0x4c, 0x48, 0x1b, 0xe1,
	0xcd, 0xfd, 0x9d, 0x46, 0xd4, 0x16, 0x78, 0x41, 0x32, 0xef, 0xb9, 0x70, 0x43, 0x9d, 0xaf, 0x3f,
	0x48, 0xfb, 0xf6, 0xa7, 0xd3, 0x07, 0x72, 0x53, 0xf6, 0x76, 0x47, 0x88, 0x51, 0x68, 0x58, 0xce,
	0x56, 0xb3, 0xcd, 0x65, 0x77, 0x5d, 0xe0, 0x7b, 0x65, 0x27, 0xa9, 0x87, 0x24, 0x8c, 0x8d, 0xcb,
	0xb3, 0x89, 0xf4, 0x5a, 0xd9, 0x5a, 0x92, 0xf9, 0x67, 0x12, 0x29, 0x47, 0xba, 0x20, 0x6d, 0x99,
	0xfc, 0x67, 0xd5, 0x0f, 0xa5, 0xe4, 0x5c, 0x61, 0x0f, 0x65, 0xb7, 0xed, 0xca, 0x9b, 0x32, 0x72,
	0x31, 0x46, 0x36, 0xab, 0x66, 0x73, 0xf5, 0xb8, 0x60, 0xb5, 0x33, 0x1b, 0x3b, 0xb3, 0x67, 0x37,
	0x74, 0xa3, 0xf4, 0xf2, 0xf4, 0xb5, 0xd5, 0x26, 0x7d, 0x67, 0xc9, 0x14, 0x1e, 0xf9, 0x21, 0x4b,
	0xd8, 0x5b, 0xfc, 0xe1, 0xde, 0x78, 0xb0, 0xc6, 0x41, 0xe4, 0xd3, 0x7b, 0x68, 0xdc, 0x29, 0x6b,
	0xc0, 0x25, 0x39, 0x2f, 0x69, 0xdb, 0xdf, 0x00, 0x00, 0x00, 0xff, 0xff, 0x12, 0x2e, 0x20, 0xa9,
	0x2f, 0x01, 0x00, 0x00,
}
